/** Comment routes: list, create, edit, soft delete. */

import { validateComment } from '@chalkcom/core/validate';
import { newId } from '@chalkcom/core/slug';
import { json, errorResponse, readJson, nowIso } from '../lib/http.js';
import { recomputeCommentCountStmt, resolveMergedPostId } from '../lib/db.js';
import { requireWriteUser } from '../lib/auth.js';

/**
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
function serializeComment(row) {
    if (row.deleted_at) {
        return {
            id: row.id,
            parentId: row.parent_id,
            deleted: true,
            body: null,
            authorName: null,
            isTeam: false,
            createdAt: row.created_at,
            replies: []
        };
    }
    return {
        id: row.id,
        parentId: row.parent_id,
        deleted: false,
        body: row.body,
        authorId: row.author_id,
        authorName: row.author_name ?? null,
        isTeam: Boolean(row.is_team),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        replies: []
    };
}

/**
 * GET /api/v1/posts/:id/comments — threaded, two levels deep. Soft-deleted
 * comments appear as tombstones so replies keep their context.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function listComments(c) {
    const postId = await resolveMergedPostId(c.env.DB, c.params.id);
    if (!postId) return errorResponse('post not found', 404);
    const { results } = await c.env.DB.prepare(
        `SELECT cm.*, u.name AS author_name FROM comments cm
         LEFT JOIN users u ON u.id = cm.author_id
         WHERE cm.post_id = ? ORDER BY cm.created_at, cm.id`
    )
        .bind(postId)
        .all();
    /** @type {Map<string, any>} */
    const byId = new Map();
    /** @type {any[]} */
    const roots = [];
    for (const row of results) {
        const comment = serializeComment(row);
        byId.set(String(row.id), comment);
        const parent = row.parent_id ? byId.get(String(row.parent_id)) : null;
        if (!parent) {
            roots.push(comment);
        } else if (parent.parentId) {
            // Deeper than two levels: attach to the parent's own thread.
            byId.get(String(parent.parentId))?.replies.push(comment);
        } else {
            parent.replies.push(comment);
        }
    }
    // Drop tombstones that have no replies; they add nothing to the thread.
    const pruned = roots.filter(
        comment => !comment.deleted || comment.replies.length > 0
    );
    return json({ comments: pruned });
}

/**
 * POST /api/v1/posts/:id/comments
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function createComment(c) {
    const body = /** @type {any} */ (await readJson(c.request)) ?? {};
    const valid = validateComment(body);
    if (!valid.ok) return errorResponse('invalid comment', 400, valid);
    const userId = await requireWriteUser(c.auth, c.env.DB);
    if (!userId) return errorResponse('authentication required', 401);
    const postId = await resolveMergedPostId(c.env.DB, c.params.id);
    if (!postId) return errorResponse('post not found', 404);

    let parentId = null;
    if (body.parentId) {
        const parent = await c.env.DB.prepare(
            `SELECT id, parent_id FROM comments
             WHERE id = ? AND post_id = ? AND deleted_at IS NULL`
        )
            .bind(body.parentId, postId)
            .first();
        if (!parent) return errorResponse('parent comment not found', 400);
        // Keep threads two levels deep: replying to a reply attaches to
        // the top-level comment.
        parentId = parent.parent_id ?? parent.id;
    }

    const id = newId();
    const now = nowIso();
    const db = c.env.DB;
    await db.batch([
        db
            .prepare(
                `INSERT INTO comments (id, post_id, parent_id, author_id,
                 body, is_team, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
                id,
                postId,
                parentId,
                userId,
                String(body.body),
                c.auth?.isStaff ? 1 : 0,
                now,
                now
            ),
        recomputeCommentCountStmt(db, postId)
    ]);
    const row = await db
        .prepare(
            `SELECT cm.*, u.name AS author_name FROM comments cm
             LEFT JOIN users u ON u.id = cm.author_id WHERE cm.id = ?`
        )
        .bind(id)
        .first();
    return json({ comment: serializeComment(row ?? {}) }, 201);
}

/**
 * @param {import('../lib/router.js').RouteContext} c
 * @returns {Promise<{ row: Record<string, unknown>, userId: string } | Response>}
 */
async function loadOwnedComment(c) {
    const row = await c.env.DB.prepare(
        'SELECT * FROM comments WHERE id = ? AND deleted_at IS NULL'
    )
        .bind(c.params.id)
        .first();
    if (!row) return errorResponse('comment not found', 404);
    const userId = await requireWriteUser(c.auth, c.env.DB);
    if (!userId) return errorResponse('authentication required', 401);
    if (!c.auth?.isStaff && row.author_id !== userId) {
        return errorResponse('not allowed', 403);
    }
    return { row, userId };
}

/**
 * PATCH /api/v1/comments/:id — author or staff.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function updateComment(c) {
    const loaded = await loadOwnedComment(c);
    if (loaded instanceof Response) return loaded;
    const body = /** @type {any} */ (await readJson(c.request)) ?? {};
    const valid = validateComment(body);
    if (!valid.ok) return errorResponse('invalid comment', 400, valid);
    await c.env.DB.prepare(
        'UPDATE comments SET body = ?, updated_at = ? WHERE id = ?'
    )
        .bind(String(body.body), nowIso(), loaded.row.id)
        .run();
    return json({ ok: true });
}

/**
 * DELETE /api/v1/comments/:id — author or staff, soft delete.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function deleteComment(c) {
    const loaded = await loadOwnedComment(c);
    if (loaded instanceof Response) return loaded;
    const db = c.env.DB;
    await db.batch([
        db
            .prepare('UPDATE comments SET deleted_at = ? WHERE id = ?')
            .bind(nowIso(), loaded.row.id),
        recomputeCommentCountStmt(db, String(loaded.row.post_id))
    ]);
    return json({ ok: true });
}
