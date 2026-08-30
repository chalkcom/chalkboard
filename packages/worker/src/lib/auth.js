/**
 * Per-request auth resolution and user upsert.
 *
 * Two credentials are accepted:
 *  - `Authorization: Bearer <jwt>` — an HS256 JWT signed by the host app
 *    with FEEDBACK_JWT_SECRET, carrying { sub, email?, name?, role?, … }.
 *  - `cb_session` cookie — a compact HMAC value set by /auth/sso.
 */

import { verifyJwt, verifySession } from '@chalkcom/core/jwt';
import { newId } from '@chalkcom/core/slug';
import { nowIso, parseCookies } from './http.js';

/**
 * @typedef {object} Auth
 * @property {'jwt' | 'session'} kind
 * @property {Record<string, unknown> | null} claims JWT claims (jwt only)
 * @property {string | null} userId users.id when known without a write
 * @property {boolean} isStaff
 */

/**
 * Resolve the caller's identity, or null for anonymous requests. Reads may
 * call this without triggering any user writes.
 * @param {Request} request
 * @param {{ DB: D1Database, FEEDBACK_JWT_SECRET?: string }} env
 * @returns {Promise<Auth | null>}
 */
export async function resolveAuth(request, env) {
    const secret = env.FEEDBACK_JWT_SECRET;
    if (!secret) return null;
    const header = request.headers.get('Authorization');
    if (header && header.startsWith('Bearer ')) {
        const claims = await verifyJwt(header.slice(7).trim(), secret);
        if (!claims) return null;
        const row = await env.DB.prepare(
            'SELECT id, role FROM users WHERE external_id = ?'
        )
            .bind(claims.sub)
            .first();
        return {
            kind: 'jwt',
            claims,
            userId: row ? String(row.id) : null,
            isStaff: claims.role === 'staff' || row?.role === 'staff'
        };
    }
    const cookie = parseCookies(request).cb_session;
    if (cookie) {
        const session = await verifySession(cookie, secret);
        if (!session) return null;
        const row = await env.DB.prepare(
            'SELECT id, role FROM users WHERE id = ?'
        )
            .bind(session.uid)
            .first();
        if (!row) return null;
        return {
            kind: 'session',
            claims: null,
            userId: String(row.id),
            isStaff: row.role === 'staff'
        };
    }
    return null;
}

/**
 * Upsert a user row from JWT claims and return its id. Called on the first
 * authenticated write (and by /auth/sso). Placeholder rows created by import
 * (external_id IS NULL, matching email) are claimed rather than duplicated.
 * @param {D1Database} db
 * @param {Record<string, unknown>} claims
 * @returns {Promise<string>}
 */
export async function ensureUserFromClaims(db, claims) {
    const sub = String(claims.sub);
    const role = claims.role === 'staff' ? 'staff' : 'member';
    const email = typeof claims.email === 'string' ? claims.email : null;
    const name = typeof claims.name === 'string' ? claims.name : null;
    const accountId =
        typeof claims.accountId === 'string' ? claims.accountId : null;
    const accountName =
        typeof claims.accountName === 'string' ? claims.accountName : null;
    const now = nowIso();

    const existing = await db
        .prepare('SELECT id FROM users WHERE external_id = ?')
        .bind(sub)
        .first();
    if (existing) {
        await db
            .prepare(
                `UPDATE users SET email = ?, name = ?, account_id = ?,
                 account_name = ?, role = ?, last_seen_at = ? WHERE id = ?`
            )
            .bind(email, name, accountId, accountName, role, now, existing.id)
            .run();
        return String(existing.id);
    }

    if (email) {
        const placeholder = await db
            .prepare(
                'SELECT id FROM users WHERE external_id IS NULL AND email = ?'
            )
            .bind(email)
            .first();
        if (placeholder) {
            await db
                .prepare(
                    `UPDATE users SET external_id = ?, name = ?,
                     account_id = ?, account_name = ?, role = ?,
                     last_seen_at = ? WHERE id = ?`
                )
                .bind(
                    sub,
                    name,
                    accountId,
                    accountName,
                    role,
                    now,
                    placeholder.id
                )
                .run();
            return String(placeholder.id);
        }
    }

    const id = newId();
    await db
        .prepare(
            `INSERT INTO users (id, external_id, email, name, account_id,
             account_name, role, source, created_at, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'sso', ?, ?)`
        )
        .bind(id, sub, email, name, accountId, accountName, role, now, now)
        .run();
    return id;
}

/**
 * Resolve the users.id to attribute a WRITE to, upserting from JWT claims
 * when needed. Returns null for anonymous callers.
 * @param {import('./auth.js').Auth | null} auth
 * @param {D1Database} db
 * @returns {Promise<string | null>}
 */
export async function requireWriteUser(auth, db) {
    if (!auth) return null;
    if (auth.kind === 'session') return auth.userId;
    if (auth.claims) return ensureUserFromClaims(db, auth.claims);
    return null;
}

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Compare two secrets without leaking match position or length through
 * timing: HMAC both with a fixed key, then compare the fixed-size digests
 * byte-for-byte with a constant-time fold.
 * @param {string} a
 * @param {string} b
 * @returns {Promise<boolean>}
 */
export async function secretsEqual(a, b) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode('chalkboard-secret-compare'),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const [da, db] = await Promise.all([
        crypto.subtle.sign('HMAC', key, enc.encode(a)),
        crypto.subtle.sign('HMAC', key, enc.encode(b))
    ]);
    const va = new Uint8Array(da);
    const vb = new Uint8Array(db);
    let diff = 0;
    for (let i = 0; i < va.length; i += 1) diff |= va[i] ^ vb[i];
    return diff === 0;
}
