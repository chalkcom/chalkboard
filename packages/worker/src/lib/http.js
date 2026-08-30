/** Small HTTP helpers shared by every route. */

/**
 * @param {unknown} data
 * @param {number} [status]
 * @param {Record<string, string>} [headers]
 * @returns {Response}
 */
export function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            ...headers
        }
    });
}

/**
 * @param {string} message
 * @param {number} status
 * @param {Record<string, unknown>} [extra]
 * @returns {Response}
 */
export function errorResponse(message, status, extra = {}) {
    return json({ error: message, ...extra }, status);
}

/**
 * Read a JSON body, returning undefined for missing/invalid JSON.
 * @param {Request} request
 * @returns {Promise<unknown>}
 */
export async function readJson(request) {
    try {
        return await request.json();
    } catch {
        return undefined;
    }
}

/**
 * @param {Request} request
 * @returns {Record<string, string>}
 */
export function parseCookies(request) {
    const header = request.headers.get('Cookie') || '';
    /** @type {Record<string, string>} */
    const cookies = {};
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        const name = part.slice(0, eq).trim();
        if (name) cookies[name] = part.slice(eq + 1).trim();
    }
    return cookies;
}

/** @returns {string} current time as ISO-8601 */
export function nowIso() {
    return new Date().toISOString();
}

/**
 * Best-effort client identifier for rate limiting unauthenticated calls.
 * @param {Request} request
 * @returns {string}
 */
export function clientIp(request) {
    return (
        request.headers.get('CF-Connecting-IP') ||
        request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
        'unknown'
    );
}

/**
 * @param {string | null | undefined} value
 * @param {number} max
 * @returns {string | null}
 */
export function truncate(value, max) {
    if (typeof value !== 'string' || value.length === 0) return null;
    return value.slice(0, max);
}
