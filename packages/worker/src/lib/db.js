/** Shared D1 query helpers. */

import { renderMarkdown } from '@chalkcom/core/markdown';

/** Fields returned for a post in API responses. */
const POST_COLUMNS = `p.id, p.board_id, p.title, p.body, p.status, p.slug,
    p.author_id, p.vote_count, p.comment_count, p.pinned, p.merged_into_id,
    p.source, p.topic, p.created_at, p.updated_at, p.status_changed_at`;

/**
 * @param {Record<string, unknown>} row
 * @param {{ bodyHtml?: boolean }} [opts]
 * @returns {Record<string, unknown>}
 */
export function serializePost(row, { bodyHtml = false } = {}) {
    const post = {
        id: row.id,
        boardId: row.board_id,
        title: row.title,
        body: row.body,
        status: row.status,
        slug: row.slug,
        authorId: row.author_id,
        authorName: row.author_name ?? null,
        voteCount: row.vote_count,
        commentCount: row.comment_count,
        pinned: Boolean(row.pinned),
        topic: row.topic,
        source: row.source,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        statusChangedAt: row.status_changed_at,
        viewerHasVoted:
            row.viewer_has_voted === undefined
                ? undefined
                : Boolean(row.viewer_has_voted)
    };
    if (bodyHtml) post.bodyHtml = renderMarkdown(String(row.body ?? ''));
    return post;
}

/**
 * Fetch a live post by id or slug (author name joined in).
 * @param {D1Database} db
 * @param {string} idOrSlug
 * @param {string | null} [viewerId] adds viewer_has_voted when set
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function getPost(db, idOrSlug, viewerId = null) {
    const voted = viewerId
        ? `, EXISTS(SELECT 1 FROM votes v WHERE v.post_id = p.id
             AND v.user_id = ?3) AS viewer_has_voted`
        : '';
    const row = await db
        .prepare(
            `SELECT ${POST_COLUMNS}, u.name AS author_name${voted}
             FROM posts p LEFT JOIN users u ON u.id = p.author_id
             WHERE (p.id = ?1 OR p.slug = ?2) AND p.deleted_at IS NULL`
        )
        .bind(
            idOrSlug,
            idOrSlug,
            .../** @type {string[]} */ (viewerId ? [viewerId] : [])
        )
        .first();
    return row ?? null;
}

/**
 * Follow a merged_into chain to the surviving post id (bounded depth).
 * @param {D1Database} db
 * @param {string} postId
 * @param {number} [maxDepth]
 * @returns {Promise<string | null>} null when the post does not exist
 */
export async function resolveMergedPostId(db, postId, maxDepth = 5) {
    let id = postId;
    for (let depth = 0; depth <= maxDepth; depth += 1) {
        const row = await db
            .prepare(
                `SELECT id, merged_into_id FROM posts
                 WHERE id = ? AND deleted_at IS NULL`
            )
            .bind(id)
            .first();
        if (!row) return null;
        if (!row.merged_into_id) return String(row.id);
        id = String(row.merged_into_id);
    }
    return id;
}

/**
 * Statement recomputing vote_count for a post from votes + vote_offset.
 * @param {D1Database} db
 * @param {string} postId
 * @returns {D1PreparedStatement}
 */
export function recomputeVoteCountStmt(db, postId) {
    return db
        .prepare(
            `UPDATE posts SET vote_count = vote_offset +
             (SELECT COUNT(*) FROM votes WHERE post_id = ?1) WHERE id = ?1`
        )
        .bind(postId);
}

/**
 * Statement recomputing comment_count (live comments only) for a post.
 * @param {D1Database} db
 * @param {string} postId
 * @returns {D1PreparedStatement}
 */
export function recomputeCommentCountStmt(db, postId) {
    return db
        .prepare(
            `UPDATE posts SET comment_count =
             (SELECT COUNT(*) FROM comments
              WHERE post_id = ?1 AND deleted_at IS NULL) WHERE id = ?1`
        )
        .bind(postId);
}

/**
 * Sanitize free text into an FTS5 MATCH expression: strip operators and
 * OR-join the remaining terms. Returns null when nothing searchable remains.
 * @param {string} input
 * @returns {string | null}
 */
export function toFtsQuery(input) {
    const terms = String(input)
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 12);
    if (terms.length === 0) return null;
    return terms.map(term => `"${term}"`).join(' OR ');
}

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').D1PreparedStatement} D1PreparedStatement */
