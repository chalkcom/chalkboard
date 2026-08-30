/** Vote routes: POST/DELETE /api/v1/posts/:id/vote. */

import { json, errorResponse, nowIso } from '../lib/http.js';
import { recomputeVoteCountStmt, resolveMergedPostId } from '../lib/db.js';
import { requireWriteUser } from '../lib/auth.js';

/**
 * @param {import('../lib/router.js').RouteContext} c
 * @param {'add' | 'remove'} action
 */
async function applyVote(c, action) {
    const userId = await requireWriteUser(c.auth, c.env.DB);
    if (!userId) return errorResponse('authentication required', 401);
    const postId = await resolveMergedPostId(c.env.DB, c.params.id);
    if (!postId) return errorResponse('post not found', 404);
    const db = c.env.DB;
    const change =
        action === 'add'
            ? db
                  .prepare(
                      `INSERT OR IGNORE INTO votes (post_id, user_id, created_at)
                       VALUES (?, ?, ?)`
                  )
                  .bind(postId, userId, nowIso())
            : db
                  .prepare(
                      'DELETE FROM votes WHERE post_id = ? AND user_id = ?'
                  )
                  .bind(postId, userId);
    await db.batch([change, recomputeVoteCountStmt(db, postId)]);
    const row = await db
        .prepare('SELECT vote_count FROM posts WHERE id = ?')
        .bind(postId)
        .first();
    return json({
        postId,
        voteCount: Number(row?.vote_count ?? 0),
        viewerHasVoted: action === 'add'
    });
}

/** @param {import('../lib/router.js').RouteContext} c */
export function addVote(c) {
    return applyVote(c, 'add');
}

/** @param {import('../lib/router.js').RouteContext} c */
export function removeVote(c) {
    return applyVote(c, 'remove');
}
