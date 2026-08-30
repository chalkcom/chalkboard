/** SSO cookie exchange: /auth/sso, its Featurebase-shaped alias, logout. */

import { verifyJwt, signSession } from '@chalkcom/core/jwt';
import { errorResponse } from '../lib/http.js';
import { ensureUserFromClaims } from '../lib/auth.js';

const SESSION_MAX_AGE = 604800; // 7 days

/**
 * Resolve a safe redirect target: return_to must be same-origin with
 * PUBLIC_URL, otherwise fall back to /.
 * @param {string | null} returnTo
 * @param {string | undefined} publicUrl
 * @returns {string}
 */
export function safeReturnTo(returnTo, publicUrl) {
    if (!returnTo || !publicUrl) return '/';
    try {
        const base = new URL(publicUrl);
        const target = new URL(returnTo, base);
        if (target.origin === base.origin) {
            return target.pathname + target.search + target.hash;
        }
    } catch {
        // fall through
    }
    return '/';
}

/**
 * GET /auth/sso?jwt=&return_to= — verify the host-signed JWT, upsert the
 * user, set the cb_session cookie and redirect.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function sso(c) {
    const token = c.url.searchParams.get('jwt');
    const secret = c.env.FEEDBACK_JWT_SECRET;
    if (!token || !secret) return errorResponse('jwt required', 400);
    const claims = await verifyJwt(token, secret);
    if (!claims) return errorResponse('invalid jwt', 401);
    const userId = await ensureUserFromClaims(c.env.DB, claims);
    const value = await signSession(
        {
            uid: userId,
            exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
        },
        secret
    );
    const location = safeReturnTo(
        c.url.searchParams.get('return_to'),
        c.env.PUBLIC_URL
    );
    return new Response(null, {
        status: 302,
        headers: {
            Location: location,
            'Set-Cookie':
                `cb_session=${value}; HttpOnly; Secure; SameSite=Lax; ` +
                `Path=/; Max-Age=${SESSION_MAX_AGE}`
        }
    });
}

/**
 * POST /auth/logout — clear the session cookie.
 */
export function logout() {
    return new Response(null, {
        status: 204,
        headers: {
            'Set-Cookie':
                'cb_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
        }
    });
}
