/**
 * Chalkboard worker. `createFeedbackApp(options)` returns `{ fetch,
 * scheduled }` for a Cloudflare Worker with D1 (`DB`), KV (`RATE`) and a
 * static-assets binding (`ASSETS`) serving the board SPA.
 *
 * @typedef {object} AppOptions
 * @property {Record<string, string>} [theme] CSS variable overrides
 * @property {Array<{ id: string, label: string }>} [topics]
 * @property {string} [boardTitle]
 */

import { json, errorResponse, clientIp } from './lib/http.js';
import {
    corsHeaders,
    matchOrigin,
    parseAllowedOrigins,
    preflightResponse
} from './lib/cors.js';
import { resolveAuth } from './lib/auth.js';
import { checkRateLimit } from './lib/ratelimit.js';
import { compileRoutes, matchRoute } from './lib/router.js';
import { getConfig, putConfig } from './routes/config.js';
import {
    countPosts,
    createPost,
    deletePost,
    getPostRoute,
    listPosts,
    mergePost,
    roadmap,
    similarPosts,
    updatePost,
    updatePostStatus
} from './routes/posts.js';
import { addVote, removeVote } from './routes/votes.js';
import {
    createComment,
    deleteComment,
    listComments,
    updateComment
} from './routes/comments.js';
import { createTag, deleteTag, setPostTags, updateTag } from './routes/tags.js';
import { exportAll, staffMetrics, staffQueue } from './routes/staff.js';
import { ingestEvents } from './routes/events.js';
import { importPosts } from './routes/importer.js';
import { logout, sso } from './routes/auth.js';
import { deleteUser, me } from './routes/users.js';
import { assistInterview, assistSynthesize } from './routes/assist.js';

const HOUR = 3600;

/** @type {import('./lib/router.js').Route[]} */
const ROUTES = [
    {
        method: 'GET',
        path: '/api/v1/config',
        access: 'public',
        handler: getConfig
    },
    {
        method: 'PUT',
        path: '/api/v1/config',
        access: 'staff',
        handler: putConfig
    },
    {
        method: 'GET',
        path: '/api/v1/posts',
        access: 'public',
        handler: listPosts
    },
    {
        method: 'GET',
        path: '/api/v1/posts/count',
        access: 'public',
        handler: countPosts
    },
    {
        method: 'GET',
        path: '/api/v1/similar',
        access: 'public',
        handler: similarPosts
    },
    {
        method: 'GET',
        path: '/api/v1/roadmap',
        access: 'public',
        handler: roadmap
    },
    { method: 'GET', path: '/api/v1/users/me', access: 'member', handler: me },
    {
        method: 'DELETE',
        path: '/api/v1/users/:id',
        access: 'staff',
        handler: deleteUser
    },
    {
        method: 'POST',
        path: '/api/v1/posts',
        access: 'member',
        handler: createPost,
        limits: [
            { name: 'post-create', limit: 10, windowSec: HOUR, by: 'user' },
            // Secondary cap: many "users" from one address is abuse.
            { name: 'post-create-ip', limit: 20, windowSec: HOUR, by: 'ip' }
        ]
    },
    {
        method: 'GET',
        path: '/api/v1/posts/:idOrSlug',
        access: 'public',
        handler: getPostRoute
    },
    {
        method: 'PATCH',
        path: '/api/v1/posts/:id',
        access: 'member',
        handler: updatePost
    },
    {
        method: 'DELETE',
        path: '/api/v1/posts/:id',
        access: 'staff',
        handler: deletePost
    },
    {
        method: 'PATCH',
        path: '/api/v1/posts/:id/status',
        access: 'staff',
        handler: updatePostStatus
    },
    {
        method: 'POST',
        path: '/api/v1/posts/:id/merge',
        access: 'staff',
        handler: mergePost
    },
    {
        method: 'POST',
        path: '/api/v1/posts/:id/vote',
        access: 'member',
        handler: addVote,
        limits: [{ name: 'vote', limit: 60, windowSec: HOUR, by: 'user' }]
    },
    {
        method: 'DELETE',
        path: '/api/v1/posts/:id/vote',
        access: 'member',
        handler: removeVote,
        limits: [{ name: 'vote', limit: 60, windowSec: HOUR, by: 'user' }]
    },
    {
        method: 'GET',
        path: '/api/v1/posts/:id/comments',
        access: 'public',
        handler: listComments
    },
    {
        method: 'POST',
        path: '/api/v1/posts/:id/comments',
        access: 'member',
        handler: createComment,
        limits: [{ name: 'comment', limit: 30, windowSec: HOUR, by: 'user' }]
    },
    {
        method: 'PATCH',
        path: '/api/v1/comments/:id',
        access: 'member',
        handler: updateComment
    },
    {
        method: 'DELETE',
        path: '/api/v1/comments/:id',
        access: 'member',
        handler: deleteComment
    },
    {
        method: 'POST',
        path: '/api/v1/tags',
        access: 'staff',
        handler: createTag
    },
    {
        method: 'PATCH',
        path: '/api/v1/tags/:id',
        access: 'staff',
        handler: updateTag
    },
    {
        method: 'DELETE',
        path: '/api/v1/tags/:id',
        access: 'staff',
        handler: deleteTag
    },
    {
        method: 'PUT',
        path: '/api/v1/posts/:id/tags',
        access: 'staff',
        handler: setPostTags
    },
    {
        method: 'GET',
        path: '/api/v1/staff/queue',
        access: 'staff',
        handler: staffQueue
    },
    {
        method: 'GET',
        path: '/api/v1/staff/metrics',
        access: 'staff',
        handler: staffMetrics
    },
    {
        method: 'POST',
        path: '/api/v1/events',
        access: 'public',
        handler: ingestEvents,
        limits: [{ name: 'events', limit: 600, windowSec: HOUR, by: 'ip' }]
    },
    {
        method: 'POST',
        path: '/api/v1/assist/interview',
        access: 'member',
        handler: assistInterview,
        limits: [
            {
                name: 'assist-interview',
                limit: 10,
                windowSec: HOUR,
                by: 'user'
            },
            {
                name: 'assist-interview-ip',
                limit: 20,
                windowSec: HOUR,
                by: 'ip'
            }
        ]
    },
    {
        method: 'POST',
        path: '/api/v1/assist/synthesize',
        access: 'member',
        handler: assistSynthesize,
        limits: [
            {
                name: 'assist-synthesize',
                limit: 10,
                windowSec: HOUR,
                by: 'user'
            }
        ]
    },
    {
        method: 'POST',
        path: '/api/v1/import',
        access: 'public',
        handler: importPosts
    },
    {
        method: 'GET',
        path: '/api/v1/export',
        access: 'staff',
        handler: exportAll
    },
    {
        method: 'GET',
        path: '/auth/sso',
        access: 'public',
        handler: sso,
        limits: [{ name: 'sso', limit: 30, windowSec: HOUR, by: 'ip' }]
    },
    {
        method: 'GET',
        path: '/api/v1/auth/access/jwt',
        access: 'public',
        handler: sso,
        limits: [{ name: 'sso', limit: 30, windowSec: HOUR, by: 'ip' }]
    },
    { method: 'POST', path: '/auth/logout', access: 'public', handler: logout }
];

/**
 * @param {import('./lib/router.js').Route} route
 * @param {import('./lib/router.js').RouteContext} c
 * @returns {Response | null} an error response, or null when allowed
 */
function checkAccess(route, c) {
    if (route.access === 'public') return null;
    if (!c.auth) return errorResponse('authentication required', 401);
    if (route.access === 'staff' && !c.auth.isStaff) {
        return errorResponse('staff only', 403);
    }
    return null;
}

/**
 * Cookie-authenticated mutations must come from an allowed origin (CSRF
 * protection); Bearer-authenticated calls are exempt.
 * @param {import('./lib/router.js').RouteContext} c
 * @param {string[]} allowed
 * @returns {Response | null}
 */
function checkCookieOrigin(c, allowed) {
    if (c.auth?.kind !== 'session') return null;
    if (['GET', 'HEAD', 'OPTIONS'].includes(c.request.method)) return null;
    const origin = c.request.headers.get('Origin');
    if (!origin) return errorResponse('origin header required', 403);
    // Only EXACT allow-list entries may ride the session cookie; wildcard
    // entries cover shared-suffix hosting where any tenant could match.
    if (matchOrigin(origin, allowed) === 'exact') return null;
    try {
        if (c.env.PUBLIC_URL && new URL(c.env.PUBLIC_URL).origin === origin) {
            return null;
        }
    } catch {
        // fall through
    }
    return errorResponse('origin not allowed', 403);
}

/**
 * @param {import('./lib/router.js').Route} route
 * @param {import('./lib/router.js').RouteContext} c
 * @returns {Promise<Response | null>}
 */
async function checkRoutedRateLimit(route, c) {
    for (const limit of route.limits ?? []) {
        // Prefer the JWT sub over users.id: the id may not exist until the
        // first write, and the subject must be stable across a window.
        const subject =
            limit.by === 'user'
                ? String(
                      c.auth?.claims?.sub ??
                          c.auth?.userId ??
                          clientIp(c.request)
                  )
                : clientIp(c.request);
        const allowed = await checkRateLimit(c.env, limit.name, subject, limit);
        if (!allowed) return errorResponse('rate limit exceeded', 429);
    }
    return null;
}

/**
 * Build the worker handlers.
 * @param {AppOptions} [options]
 * @returns {{ fetch: Function, scheduled: Function }}
 */
export function createFeedbackApp(options = {}) {
    const compiled = compileRoutes(ROUTES);

    /**
     * @param {Request} request
     * @param {Record<string, any>} env
     * @param {any} ctx
     * @returns {Promise<Response>}
     */
    async function handle(request, env, ctx) {
        const url = new URL(request.url);
        const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
        if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
            return preflightResponse(request, allowed);
        }
        const match = matchRoute(compiled, request.method, url.pathname);
        if (!match) {
            if (env.ASSETS) return env.ASSETS.fetch(request);
            return errorResponse('not found', 404);
        }
        const auth = await resolveAuth(request, env);
        /** @type {import('./lib/router.js').RouteContext} */
        const c = {
            request,
            env,
            ctx,
            url,
            params: match.params,
            auth,
            options
        };
        const denied =
            checkAccess(match.route, c) ??
            checkCookieOrigin(c, allowed) ??
            (await checkRoutedRateLimit(match.route, c));
        const response = denied ?? (await match.route.handler(c));
        const cors = corsHeaders(request, allowed);
        if (Object.keys(cors).length === 0) return response;
        const withCors = new Response(response.body, response);
        for (const [key, value] of Object.entries(cors)) {
            withCors.headers.set(key, value);
        }
        return withCors;
    }

    return {
        /**
         * @param {Request} request
         * @param {Record<string, any>} env
         * @param {any} ctx
         */
        async fetch(request, env, ctx) {
            try {
                return await handle(request, env, ctx);
            } catch (err) {
                // eslint-disable-next-line no-console -- surfaced in wrangler tail
                console.error('unhandled error', err);
                return json({ error: 'internal error' }, 500);
            }
        },

        /**
         * Cron: prune analytics events older than 180 days.
         * @param {unknown} _event
         * @param {Record<string, any>} env
         */
        async scheduled(_event, env) {
            // Compare in the same ISO-8601 'T'/'Z' shape events are stored
            // in; datetime() emits a space separator, which is off-by-a-hair
            // against ISO strings at the boundary.
            await env.DB.prepare(
                `DELETE FROM events WHERE created_at <
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-180 days')`
            ).run();
        }
    };
}
