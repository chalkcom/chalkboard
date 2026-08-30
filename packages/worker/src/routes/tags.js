/** Tag management (staff): CRUD + replacing a post's tag set. */

import { validateTag } from '@chalkcom/core/validate';
import { newId } from '@chalkcom/core/slug';
import { json, errorResponse, readJson, nowIso } from '../lib/http.js';

/**
 * POST /api/v1/tags
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function createTag(c) {
    const body = /** @type {any} */ (await readJson(c.request)) ?? {};
    if (!validateTag(body.name).ok) return errorResponse('invalid tag', 400);
    const id = newId();
    try {
        await c.env.DB.prepare(
            `INSERT INTO tags (id, name, color, is_private, created_at)
             VALUES (?, ?, ?, ?, ?)`
        )
            .bind(
                id,
                String(body.name).trim(),
                typeof body.color === 'string' ? body.color.slice(0, 20) : null,
                body.isPrivate ? 1 : 0,
                nowIso()
            )
            .run();
    } catch {
        return errorResponse('tag already exists', 409);
    }
    const tag = await c.env.DB.prepare('SELECT * FROM tags WHERE id = ?')
        .bind(id)
        .first();
    return json({ tag }, 201);
}

/**
 * PATCH /api/v1/tags/:id
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function updateTag(c) {
    const body = /** @type {any} */ (await readJson(c.request)) ?? {};
    const sets = [];
    const binds = [];
    if (body.name !== undefined) {
        if (!validateTag(body.name).ok) {
            return errorResponse('invalid tag', 400);
        }
        sets.push('name = ?');
        binds.push(String(body.name).trim());
    }
    if (body.color !== undefined) {
        sets.push('color = ?');
        binds.push(
            typeof body.color === 'string' ? body.color.slice(0, 20) : null
        );
    }
    if (body.isPrivate !== undefined) {
        sets.push('is_private = ?');
        binds.push(body.isPrivate ? 1 : 0);
    }
    if (sets.length === 0) return errorResponse('nothing to update', 400);
    const result = await c.env.DB.prepare(
        `UPDATE tags SET ${sets.join(', ')} WHERE id = ?`
    )
        .bind(...binds, c.params.id)
        .run();
    if (!result.meta.changes) return errorResponse('tag not found', 404);
    return json({ ok: true });
}

/**
 * DELETE /api/v1/tags/:id
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function deleteTag(c) {
    const db = c.env.DB;
    const result = await db.batch([
        db.prepare('DELETE FROM post_tags WHERE tag_id = ?').bind(c.params.id),
        db.prepare('DELETE FROM tags WHERE id = ?').bind(c.params.id)
    ]);
    if (!result[1].meta.changes) return errorResponse('tag not found', 404);
    return json({ ok: true });
}

/**
 * PUT /api/v1/posts/:id/tags — replace a post's tag set.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function setPostTags(c) {
    const body = /** @type {any} */ (await readJson(c.request)) ?? {};
    const tagIds = Array.isArray(body.tagIds) ? body.tagIds.slice(0, 20) : null;
    if (!tagIds) return errorResponse('tagIds array required', 400);
    const db = c.env.DB;
    const post = await db
        .prepare('SELECT id FROM posts WHERE id = ? AND deleted_at IS NULL')
        .bind(c.params.id)
        .first();
    if (!post) return errorResponse('post not found', 404);
    await db.batch([
        db.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(post.id),
        ...tagIds.map(tagId =>
            db
                .prepare(
                    `INSERT OR IGNORE INTO post_tags (post_id, tag_id)
                     SELECT ?, id FROM tags WHERE id = ?`
                )
                .bind(post.id, String(tagId))
        )
    ]);
    const { results: tags } = await db
        .prepare(
            `SELECT t.id, t.name, t.color FROM post_tags pt
             JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = ?`
        )
        .bind(post.id)
        .all();
    return json({ tags });
}
