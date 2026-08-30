/**
 * Tiny hand-rolled router: routes declare a method and a `/path/:param`
 * pattern; patterns are compiled to regexes once when the app is created.
 */

/**
 * @typedef {object} RouteContext
 * @property {Request} request
 * @property {Record<string, any>} env
 * @property {ExecutionContext} ctx
 * @property {URL} url
 * @property {Record<string, string>} params
 * @property {import('./auth.js').Auth | null} auth
 * @property {Record<string, unknown>} options app options from createFeedbackApp
 */

/**
 * @typedef {object} Route
 * @property {string} method
 * @property {string} path
 * @property {(c: RouteContext) => Promise<Response> | Response} handler
 * @property {'public' | 'member' | 'staff'} access
 * @property {Array<{ name: string, limit: number, windowSec: number, by: 'user' | 'ip' }>} [limits]
 */

/**
 * @param {Route[]} routes
 * @returns {Array<Route & { regex: RegExp, keys: string[] }>}
 */
export function compileRoutes(routes) {
    return routes.map(route => {
        /** @type {string[]} */
        const keys = [];
        const pattern = route.path
            .split('/')
            .map(segment => {
                if (segment.startsWith(':')) {
                    keys.push(segment.slice(1));
                    return '([^/]+)';
                }
                return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            })
            .join('/');
        return { ...route, regex: new RegExp(`^${pattern}$`), keys };
    });
}

/**
 * @param {Array<Route & { regex: RegExp, keys: string[] }>} compiled
 * @param {string} method
 * @param {string} pathname
 * @returns {{ route: Route, params: Record<string, string> } | null}
 */
export function matchRoute(compiled, method, pathname) {
    for (const route of compiled) {
        if (route.method !== method) continue;
        const match = route.regex.exec(pathname);
        if (!match) continue;
        /** @type {Record<string, string>} */
        const params = {};
        route.keys.forEach((key, i) => {
            params[key] = decodeURIComponent(match[i + 1]);
        });
        return { route, params };
    }
    return null;
}

/** @typedef {import('@cloudflare/workers-types').ExecutionContext} ExecutionContext */
