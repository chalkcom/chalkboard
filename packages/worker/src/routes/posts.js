/** Post routes: list, count, get, create, edit, status, merge, delete. */

import { slugify, uniqueSlug, newId } from '@chalkcom/core/slug';
import {
    validatePost,
    validateStatus,
    validateTopic
} from '@chalkcom/core/validate';
import { json, errorResponse, readJson, nowIso } from '../lib/http.js';
import {
    getPost,
    recomputeCommentCountStmt,
    recomputeVoteCountStmt,
    resolveMergedPostId,
    serializePost,
    toFtsQuery
} from '../lib/db.js';
import { requireWriteUser } from '../lib/auth.js';

const MAX_LIMIT = 50;

/**
 * @param {string | null} cursor
 * @returns {{ v: string | number, id: string } | null}
 */
function decodeCursor(cursor) {
    if (!cursor) return null;
    try {
        const parsed = JSON.parse(atob(cursor));
        if (parsed && parsed.id !== undefined && parsed.v !== undefined) {
            return parsed;
        }
    } catch {
        // fall through
    }
    return null;
}

/**
 * @param {string | number} v
 * @param {string} id
 * @returns {string}
 */
function encodeCursor(v, id) {
    return btoa(JSON.stringify({ v, id }));
}

/**
 * Build WHERE clauses/binds for the post list filters.
 * @param {URLSearchParams} search
 * @returns {{ where: string[], binds: unknown[] }}
 */
function listFilters(search) {
    const where = ['p.deleted_at IS NULL', 'p.merged_into_id IS NULL'];
    /** @type {unknown[]} */
    const binds = [];
    const filters = [
        ['board', 'b.slug = ?'],
        ['status', 'p.status = ?'],
        ['topic', 'p.topic = ?']
    ];
    for (const [param, clause] of filters) {
        const value = search.get(param);
        if (value) {
            where.push(clause);
            binds.push(value);
        }
    }
    const tag = search.get('tag');
    if (tag) {
        where.push(
            `EXISTS(SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
              WHERE pt.post_id = p.id AND t.name = ? COLLATE NOCASE)`
        );
        binds.push(tag);
    }
    return { where, binds };
}

/**
 * @param {string} sort
 * @returns {{ orderBy: string, cursorClause: string, cursorValue: (row: any) => string | number }}
 */
function sortSpec(sort) {
    if (sort === 'new' || sort === 'trending') {
        return {
            orderBy: 'p.created_at DESC, p.id DESC',
            cursorClause:
                '(p.created_at < ? OR (p.created_at = ? AND p.id < ?))',
            cursorValue: row => String(row.created_at)
        };
    }
    return {
        orderBy: 'p.vote_count DESC, p.id DESC',
        cursorClause: '(p.vote_count < ? OR (p.vote_count = ? AND p.id < ?))',
        cursorValue: row => Number(row.vote_count)
    };
}

/**
 * GET /api/v1/posts — filterable, keyset-paginated list.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function listPosts(c) {
    const search = c.url.searchParams;
    const limit = Math.min(
        Math.max(Number(search.get('limit')) || 20, 1),
        MAX_LIMIT
    );
    const sort = search.get('sort') || 'top';
    const q = search.get('q');
    const { where, binds } = listFilters(search);
    // Trending favours recent posts; keyset stays on created_at.
    if (sort === 'trending') {
        where.push("p.created_at > datetime('now', '-90 days')");
    }
    const viewerId = c.auth?.userId ?? null;
    const votedSelect = viewerId
        ? `, EXISTS(SELECT 1 FROM votes v WHERE v.post_id = p.id
             AND v.user_id = ?) AS viewer_has_voted`
        : '';

    if (q) {
        return listPostsByQuery(c, q, { where, binds, limit, votedSelect });
    }

    const spec = sortSpec(sort);
    const cursor = decodeCursor(search.get('cursor'));
    if (cursor) {
        where.push(spec.cursorClause);
        binds.push(cursor.v, cursor.v, cursor.id);
    }
    const stmt = c.env.DB.prepare(
        `SELECT p.*, u.name AS author_name, b.slug AS board_slug${votedSelect}
         FROM posts p
         JOIN boards b ON b.id = p.board_id
         LEFT JOIN users u ON u.id = p.author_id
         WHERE ${where.join(' AND ')}
         ORDER BY p.pinned DESC, ${spec.orderBy}
         LIMIT ?`
    ).bind(...(viewerId ? [viewerId] : []), ...binds, limit + 1);
    const { results } = await stmt.all();
    const page = results.slice(0, limit);
    const nextCursor =
        results.length > limit && page.length > 0
            ? encodeCursor(
                  spec.cursorValue(page[page.length - 1]),
                  String(page[page.length - 1].id)
              )
            : null;
    return json({ posts: page.map(row => serializePost(row)), nextCursor });
}

/**
 * FTS-backed search branch of the post list (no cursor pagination).
 * @param {import('../lib/router.js').RouteContext} c
 * @param {string} q
 * @param {{ where: string[], binds: unknown[], limit: number, votedSelect: string }} opts
 */
async function listPostsByQuery(c, q, { where, binds, limit, votedSelect }) {
    const match = toFtsQuery(q);
    if (!match) return json({ posts: [], nextCursor: null });
    const viewerId = c.auth?.userId ?? null;
    const { results } = await c.env.DB.prepare(
        `SELECT p.*, u.name AS author_name, b.slug AS board_slug${votedSelect}
         FROM posts_fts f
         JOIN posts p ON p.id = f.post_id
         JOIN boards b ON b.id = p.board_id
         LEFT JOIN users u ON u.id = p.author_id
         WHERE posts_fts MATCH ? AND ${where.join(' AND ')}
         ORDER BY bm25(posts_fts) LIMIT ?`
    )
        .bind(...(viewerId ? [viewerId] : []), match, ...binds, limit)
        .all();
    return json({
        posts: results.map(row => serializePost(row)),
        nextCursor: null
    });
}

/**
 * GET /api/v1/posts/count?topic=&status=a,b
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function countPosts(c) {
    const where = ['deleted_at IS NULL', 'merged_into_id IS NULL'];
    /** @type {unknown[]} */
    const binds = [];
    const topic = c.url.searchParams.get('topic');
    if (topic) {
        where.push('topic = ?');
        binds.push(topic);
    }
    const statuses = (c.url.searchParams.get('status') || '')
        .split(',')
        .map(s => s.trim())
        .filter(s => validateStatus(s).ok);
    if (statuses.length > 0) {
        where.push(`status IN (${statuses.map(() => '?').join(',')})`);
        binds.push(...statuses);
    }
    const row = await c.env.DB.prepare(
        `SELECT COUNT(*) AS count FROM posts WHERE ${where.join(' AND ')}`
    )
        .bind(...binds)
        .first();
    return json({ count: Number(row?.count ?? 0) }, 200, {
        'cache-control': 'public, s-maxage=60'
    });
}

/**
 * GET /api/v1/posts/:idOrSlug
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function getPostRoute(c) {
    const row = await getPost(
        c.env.DB,
        c.params.idOrSlug,
        c.auth?.userId ?? null
    );
    if (!row) return errorResponse('post not found', 404);
    const post = serializePost(row, { bodyHtml: true });
    if (row.merged_into_id) {
        const target = await c.env.DB.prepare(
            'SELECT id, slug FROM posts WHERE id = ?'
        )
            .bind(row.merged_into_id)
            .first();
        post.mergedInto = target ? { id: target.id, slug: target.slug } : null;
    }
    const { results: tags } = await c.env.DB.prepare(
        `SELECT t.id, t.name, t.color FROM post_tags pt
         JOIN tags t ON t.id = pt.tag_id
         WHERE pt.post_id = ? AND t.is_private = 0`
    )
        .bind(row.id)
        .all();
    post.tags = tags;
    return json({ post });
}

/**
 * GET /api/v1/similar?title=
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function similarPosts(c) {
    const match = toFtsQuery(c.url.searchParams.get('title') || '');
    if (!match) return json({ posts: [] });
    const { results } = await c.env.DB.prepare(
        `SELECT p.id, p.title, p.slug, p.status, p.vote_count
         FROM posts_fts f JOIN posts p ON p.id = f.post_id
         WHERE posts_fts MATCH ?
           AND p.deleted_at IS NULL AND p.merged_into_id IS NULL
         ORDER BY bm25(posts_fts) LIMIT 5`
    )
        .bind(match)
        .all();
    return json({
        posts: results.map(row => ({
            id: row.id,
            title: row.title,
            slug: row.slug,
            status: row.status,
            voteCount: row.vote_count
        }))
    });
}

/**
 * GET /api/v1/roadmap
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function roadmap(c) {
    const columns = ['planned', 'in_progress', 'complete'];
    const { results } = await c.env.DB.prepare(
        `SELECT p.*, u.name AS author_name FROM posts p
         LEFT JOIN users u ON u.id = p.author_id
         WHERE p.status IN ('planned','in_progress','complete')
           AND p.deleted_at IS NULL AND p.merged_into_id IS NULL
         ORDER BY p.vote_count DESC, p.id DESC`
    ).all();
    /** @type {Record<string, unknown[]>} */
    const grouped = Object.fromEntries(columns.map(s => [s, []]));
    for (const row of results) {
        grouped[String(row.status)].push(serializePost(row));
    }
    return json(grouped);
}

/**
 * POST /api/v1/posts
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function createPost(c) {
    const body = /** @type {any} */ (await readJson(c.request)) ?? {};
    const valid = validatePost(body);
    if (!valid.ok) return errorResponse('invalid post', 400, valid);
    if (body.topic && !validateTopic(body.topic).ok) {
        return errorResponse('invalid topic', 400);
    }
    const userId = await requireWriteUser(c.auth, c.env.DB);
    if (!userId) return errorResponse('authentication required', 401);

    const board = body.boardId
        ? await c.env.DB.prepare(
              'SELECT id FROM boards WHERE id = ? OR slug = ?'
          )
              .bind(body.boardId, body.boardId)
              .first()
        : await c.env.DB.prepare(
              'SELECT id FROM boards ORDER BY position, created_at LIMIT 1'
          ).first();
    if (!board) return errorResponse('board not found', 400);

    const slug = await uniqueSlug(slugify(body.title), async candidate => {
        const row = await c.env.DB.prepare(
            'SELECT 1 AS x FROM posts WHERE slug = ?'
        )
            .bind(candidate)
            .first();
        return Boolean(row);
    });
    const id = newId();
    const now = nowIso();
    const source = typeof body.source === 'string' ? body.source : 'board';
    await c.env.DB.prepare(
        `INSERT INTO posts (id, board_id, title, body, slug, author_id,
         source, topic, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
        .bind(
            id,
            board.id,
            String(body.title).trim(),
            typeof body.body === 'string' ? body.body : '',
            slug,
            userId,
            source.slice(0, 40),
            body.topic ?? null,
            now,
            now
        )
        .run();
    const row = await getPost(c.env.DB, id, userId);
    return json({ post: serializePost(row ?? {}, { bodyHtml: true }) }, 201);
}

/**
 * PATCH /api/v1/posts/:id — author (≤24h) or staff.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function updatePost(c) {
    const row = await getPost(c.env.DB, c.params.id);
    if (!row) return errorResponse('post not found', 404);
    const userId = await requireWriteUser(c.auth, c.env.DB);
    if (!userId) return errorResponse('authentication required', 401);
    const isStaff = Boolean(c.auth?.isStaff);
    const isAuthor = row.author_id === userId;
    const ageMs = Date.now() - Date.parse(String(row.created_at));
    if (!isStaff && !(isAuthor && ageMs <= 24 * 3600 * 1000)) {
        return errorResponse('not allowed', 403);
    }
    const body = /** @type {any} */ (await readJson(c.request)) ?? {};
    const updates = buildPostUpdates(body, isStaff);
    if (typeof updates === 'string') return errorResponse(updates, 400);
    if (updates.sets.length === 0) {
        return errorResponse('nothing to update', 400);
    }
    updates.sets.push('updated_at = ?');
    updates.binds.push(nowIso());
    await c.env.DB.prepare(
        `UPDATE posts SET ${updates.sets.join(', ')} WHERE id = ?`
    )
        .bind(...updates.binds, row.id)
        .run();
    const fresh = await getPost(c.env.DB, String(row.id), userId);
    return json({ post: serializePost(fresh ?? {}, { bodyHtml: true }) });
}

/**
 * @param {any} body
 * @param {boolean} isStaff
 * @returns {{ sets: string[], binds: unknown[] } | string} error message on
 *   invalid input
 */
function buildPostUpdates(body, isStaff) {
    /** @type {string[]} */
    const sets = [];
    /** @type {unknown[]} */
    const binds = [];
    if (body.title !== undefined || body.body !== undefined) {
        const valid = validatePost({
            title: body.title ?? 'placeholder',
            body: body.body
        });
        if (!valid.ok) return 'invalid post';
    }
    if (typeof body.title === 'string') {
        sets.push('title = ?');
        binds.push(body.title.trim());
    }
    if (typeof body.body === 'string') {
        sets.push('body = ?');
        binds.push(body.body);
    }
    if (!isStaff) return { sets, binds };
    return addStaffPostUpdates(body, sets, binds);
}

/**
 * Staff-only fields on PATCH /posts/:id.
 * @param {any} body
 * @param {string[]} sets
 * @param {unknown[]} binds
 * @returns {{ sets: string[], binds: unknown[] } | string}
 */
function addStaffPostUpdates(body, sets, binds) {
    if (body.pinned !== undefined) {
        sets.push('pinned = ?');
        binds.push(body.pinned ? 1 : 0);
    }
    if (body.topic !== undefined) {
        if (body.topic !== null && !validateTopic(body.topic).ok) {
            return 'invalid topic';
        }
        sets.push('topic = ?');
        binds.push(body.topic);
    }
    if (typeof body.boardId === 'string') {
        sets.push('board_id = ?');
        binds.push(body.boardId);
    }
    return { sets, binds };
}

/**
 * PATCH /api/v1/posts/:id/status — staff only.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function updatePostStatus(c) {
    const body = /** @type {any} */ (await readJson(c.request)) ?? {};
    if (!validateStatus(body.status).ok) {
        return errorResponse('invalid status', 400);
    }
    const now = nowIso();
    const result = await c.env.DB.prepare(
        `UPDATE posts SET status = ?, status_changed_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`
    )
        .bind(body.status, now, now, c.params.id)
        .run();
    if (!result.meta.changes) return errorResponse('post not found', 404);
    const row = await getPost(c.env.DB, c.params.id);
    return json({ post: serializePost(row ?? {}) });
}

/**
 * POST /api/v1/posts/:id/merge — staff only. Coalesces votes, moves
 * comments, sums vote_offset, recomputes counts, marks the source merged.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function mergePost(c) {
    const body = /** @type {any} */ (await readJson(c.request)) ?? {};
    const sourceId = c.params.id;
    const intoId = typeof body.intoId === 'string' ? body.intoId : null;
    if (!intoId || intoId === sourceId) {
        return errorResponse('intoId required', 400);
    }
    const source = await getPost(c.env.DB, sourceId);
    const targetId = await resolveMergedPostId(c.env.DB, intoId);
    if (!source || !targetId || targetId === sourceId) {
        return errorResponse('post not found', 404);
    }
    if (source.merged_into_id) {
        return errorResponse('post already merged', 400);
    }
    const db = c.env.DB;
    const now = nowIso();
    await db.batch([
        db
            .prepare(
                `INSERT OR IGNORE INTO votes (post_id, user_id, created_at)
                 SELECT ?, user_id, created_at FROM votes WHERE post_id = ?`
            )
            .bind(targetId, sourceId),
        db.prepare('DELETE FROM votes WHERE post_id = ?').bind(sourceId),
        db
            .prepare(
                `UPDATE posts SET vote_offset = vote_offset +
                 (SELECT vote_offset FROM posts WHERE id = ?) WHERE id = ?`
            )
            .bind(sourceId, targetId),
        db
            .prepare('UPDATE comments SET post_id = ? WHERE post_id = ?')
            .bind(targetId, sourceId),
        db
            .prepare(
                `UPDATE posts SET merged_into_id = ?, vote_count = 0,
                 comment_count = 0, updated_at = ? WHERE id = ?`
            )
            .bind(targetId, now, sourceId),
        recomputeVoteCountStmt(db, targetId),
        recomputeCommentCountStmt(db, targetId)
    ]);
    const row = await getPost(db, targetId);
    return json({ post: serializePost(row ?? {}) });
}

/**
 * DELETE /api/v1/posts/:id — staff only, soft delete.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function deletePost(c) {
    const result = await c.env.DB.prepare(
        `UPDATE posts SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`
    )
        .bind(nowIso(), c.params.id)
        .run();
    if (!result.meta.changes) return errorResponse('post not found', 404);
    return json({ ok: true });
}
