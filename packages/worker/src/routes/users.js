/** User routes: GET /api/v1/users/me, DELETE /api/v1/users/:id (staff). */

import { json, errorResponse } from '../lib/http.js';
import { ensureUserFromClaims } from '../lib/auth.js';

/**
 * GET /api/v1/users/me — member.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function me(c) {
    const auth = c.auth;
    if (!auth) return errorResponse('authentication required', 401);
    let userId = auth.userId;
    if (!userId && auth.claims) {
        // First contact from a JWT holder: materialise the user row so the
        // board can show identity consistently.
        userId = await ensureUserFromClaims(c.env.DB, auth.claims);
    }
    const row = await c.env.DB.prepare(
        `SELECT id, email, name, account_id, account_name, role
         FROM users WHERE id = ?`
    )
        .bind(userId)
        .first();
    if (!row) return errorResponse('user not found', 404);
    return json({
        user: {
            id: row.id,
            email: row.email,
            name: row.name,
            accountId: row.account_id,
            accountName: row.account_name,
            role: row.role,
            isStaff: auth.isStaff || row.role === 'staff'
        }
    });
}

/**
 * DELETE /api/v1/users/:id — staff. Anonymizes the user; with ?purge=1 the
 * user's votes are removed and their authorship links cleared.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function deleteUser(c) {
    const db = c.env.DB;
    const row = await db
        .prepare('SELECT id FROM users WHERE id = ?')
        .bind(c.params.id)
        .first();
    if (!row) return errorResponse('user not found', 404);
    const userId = String(row.id);
    const purge = c.url.searchParams.get('purge') === '1';

    /** @type {any[]} */
    const statements = [
        db
            .prepare(
                `UPDATE users SET external_id = NULL, email = NULL,
                 name = 'Deleted user', account_id = NULL,
                 account_name = NULL WHERE id = ?`
            )
            .bind(userId)
    ];
    if (purge) {
        const { results: voted } = await db
            .prepare('SELECT post_id FROM votes WHERE user_id = ?')
            .bind(userId)
            .all();
        statements.push(
            db.prepare('DELETE FROM votes WHERE user_id = ?').bind(userId),
            db
                .prepare(
                    'UPDATE posts SET author_id = NULL WHERE author_id = ?'
                )
                .bind(userId),
            db
                .prepare(
                    'UPDATE comments SET author_id = NULL WHERE author_id = ?'
                )
                .bind(userId),
            ...voted.map(vote =>
                db
                    .prepare(
                        `UPDATE posts SET vote_count = vote_offset +
                         (SELECT COUNT(*) FROM votes WHERE post_id = ?1)
                         WHERE id = ?1`
                    )
                    .bind(vote.post_id)
            )
        );
    }
    await db.batch(statements);
    return json({ ok: true, purged: purge });
}
