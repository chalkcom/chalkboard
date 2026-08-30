/**
 * POST /api/v1/import — bulk import from another feedback tool, guarded by
 * the IMPORT_TOKEN secret. Idempotent: posts, comments and voters carry an
 * external_ref and re-imports upsert instead of duplicating.
 */

import { slugify, uniqueSlug, newId } from '@chalkcom/core/slug';
import { validatePost } from '@chalkcom/core/validate';
import { json, errorResponse, readJson, nowIso } from '../lib/http.js';
import { secretsEqual } from '../lib/auth.js';

const MAX_POSTS = 100;

/**
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function importPosts(c) {
    const header = c.request.headers.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (
        !c.env.IMPORT_TOKEN ||
        !(await secretsEqual(token, c.env.IMPORT_TOKEN))
    ) {
        return errorResponse('invalid import token', 401);
    }
    const body = /** @type {any} */ (await readJson(c.request)) ?? {};
    const posts = Array.isArray(body.posts) ? body.posts : null;
    if (!posts) return errorResponse('posts array required', 400);
    if (posts.length > MAX_POSTS) {
        return errorResponse(`at most ${MAX_POSTS} posts per call`, 400);
    }
    const dryRun = Boolean(body.dryRun);
    const board = await c.env.DB.prepare(
        'SELECT id FROM boards ORDER BY position, created_at LIMIT 1'
    ).first();
    if (!board) return errorResponse('no board configured', 500);

    const counts = {
        created: 0,
        updated: 0,
        skipped: 0,
        comments: 0,
        votes: 0
    };
    for (const item of posts) {
        const outcome = await importOne(
            c.env.DB,
            String(board.id),
            item,
            dryRun
        );
        counts[outcome.result] += 1;
        counts.comments += outcome.comments;
        counts.votes += outcome.votes;
    }
    return json({ dryRun, counts });
}

/**
 * @param {any} db
 * @param {string} boardId
 * @param {any} item
 * @param {boolean} dryRun
 * @returns {Promise<{ result: 'created' | 'updated' | 'skipped', comments: number, votes: number }>}
 */
async function importOne(db, boardId, item, dryRun) {
    if (!item || !validatePost(item).ok || !item.externalRef) {
        return { result: 'skipped', comments: 0, votes: 0 };
    }
    const comments = Array.isArray(item.comments) ? item.comments : [];
    const voters = Array.isArray(item.voters) ? item.voters : [];
    const existing = await db
        .prepare('SELECT id FROM posts WHERE external_ref = ?')
        .bind(String(item.externalRef))
        .first();
    if (dryRun) {
        return {
            result: existing ? 'updated' : 'created',
            comments: comments.length,
            votes: voters.length
        };
    }

    const postId = existing
        ? await updateImportedPost(db, String(existing.id), item)
        : await insertImportedPost(db, boardId, item);

    const importedComments = await importComments(db, postId, comments);
    const importedVotes = await importVoters(db, postId, voters);
    await db
        .prepare(
            `UPDATE posts SET
             vote_count = vote_offset +
               (SELECT COUNT(*) FROM votes WHERE post_id = ?1),
             comment_count =
               (SELECT COUNT(*) FROM comments WHERE post_id = ?1
                AND deleted_at IS NULL)
             WHERE id = ?1`
        )
        .bind(postId)
        .run();
    return {
        result: existing ? 'updated' : 'created',
        comments: importedComments,
        votes: importedVotes
    };
}

/**
 * @param {any} db
 * @param {string} postId
 * @param {any} item
 * @returns {Promise<string>} the post id
 */
async function updateImportedPost(db, postId, item) {
    await db
        .prepare(
            `UPDATE posts SET title = ?, body = ?, vote_offset = ?,
             updated_at = ? WHERE id = ?`
        )
        .bind(
            String(item.title).trim(),
            typeof item.body === 'string' ? item.body : '',
            Number(item.voteOffset) || 0,
            nowIso(),
            postId
        )
        .run();
    return postId;
}

/**
 * @param {any} db
 * @param {string} boardId
 * @param {any} item
 * @returns {Promise<string>} the new post id
 */
async function insertImportedPost(db, boardId, item) {
    const postId = newId();
    const slug = await resolveImportSlug(db, item);
    const now = nowIso();
    await db
        .prepare(
            `INSERT INTO posts (id, board_id, title, body, status, slug,
             vote_offset, source, topic, external_ref, created_at,
             updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'import', ?, ?, ?, ?)`
        )
        .bind(
            postId,
            boardId,
            String(item.title).trim(),
            typeof item.body === 'string' ? item.body : '',
            typeof item.status === 'string' ? item.status : 'open',
            slug,
            Number(item.voteOffset) || 0,
            item.topic ?? null,
            String(item.externalRef),
            typeof item.createdAt === 'string' ? item.createdAt : now,
            now
        )
        .run();
    return postId;
}

/**
 * @param {any} db
 * @param {any} item
 * @returns {Promise<string>}
 */
async function resolveImportSlug(db, item) {
    const base =
        typeof item.slug === 'string' && item.slug
            ? slugify(item.slug)
            : slugify(String(item.title));
    return uniqueSlug(base, async candidate => {
        const row = await db
            .prepare('SELECT 1 AS x FROM posts WHERE slug = ?')
            .bind(candidate)
            .first();
        return Boolean(row);
    });
}

/**
 * Upsert an imported participant as a placeholder user (external_id stays
 * NULL until they sign in via SSO with a matching email).
 * @param {any} db
 * @param {any} person `{ email?, name?, externalRef? }`
 * @returns {Promise<string | null>} users.id
 */
async function importUser(db, person) {
    if (!person) return null;
    const email = typeof person.email === 'string' ? person.email : null;
    const ref =
        typeof person.externalRef === 'string' ? person.externalRef : null;
    if (!email && !ref) return null;
    const existing = await db
        .prepare(
            `SELECT id FROM users
             WHERE (external_ref = ?1 AND ?1 IS NOT NULL)
                OR (email = ?2 AND ?2 IS NOT NULL)
             LIMIT 1`
        )
        .bind(ref, email)
        .first();
    if (existing) return String(existing.id);
    const id = newId();
    await db
        .prepare(
            `INSERT INTO users (id, email, name, source, external_ref,
             created_at) VALUES (?, ?, ?, 'import', ?, ?)`
        )
        .bind(
            id,
            email,
            typeof person.name === 'string' ? person.name : null,
            ref,
            nowIso()
        )
        .run();
    return id;
}

/**
 * @param {any} db
 * @param {string} postId
 * @param {any[]} comments
 * @returns {Promise<number>}
 */
async function importComments(db, postId, comments) {
    let imported = 0;
    for (const comment of comments.slice(0, 200)) {
        if (!comment || typeof comment.body !== 'string' || !comment.body) {
            continue;
        }
        const ref =
            typeof comment.externalRef === 'string'
                ? comment.externalRef
                : null;
        if (ref) {
            const existing = await db
                .prepare('SELECT id FROM comments WHERE external_ref = ?')
                .bind(ref)
                .first();
            if (existing) continue;
        }
        const authorId = await importUser(db, comment.author);
        const now = nowIso();
        await db
            .prepare(
                `INSERT INTO comments (id, post_id, author_id, body, is_team,
                 external_ref, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
                newId(),
                postId,
                authorId,
                comment.body,
                comment.isTeam ? 1 : 0,
                ref,
                typeof comment.createdAt === 'string' ? comment.createdAt : now,
                now
            )
            .run();
        imported += 1;
    }
    return imported;
}

/**
 * @param {any} db
 * @param {string} postId
 * @param {any[]} voters
 * @returns {Promise<number>}
 */
async function importVoters(db, postId, voters) {
    let imported = 0;
    for (const voter of voters.slice(0, 500)) {
        const userId = await importUser(db, voter);
        if (!userId) continue;
        await db
            .prepare(
                `INSERT OR IGNORE INTO votes (post_id, user_id, created_at)
                 VALUES (?, ?, ?)`
            )
            .bind(postId, userId, nowIso())
            .run();
        imported += 1;
    }
    return imported;
}
