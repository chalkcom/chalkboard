/**
 * CORS handling. Origins are matched exactly against ALLOWED_ORIGINS; an
 * entry may use `*` only as a full-origin wildcard for one subdomain level
 * or more, e.g. `https://*.netlify.app`.
 */

/**
 * @param {string | undefined} allowedOrigins comma-separated list
 * @returns {string[]}
 */
export function parseAllowedOrigins(allowedOrigins) {
    return (allowedOrigins || '')
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
}

/**
 * @param {string | null} origin the request's Origin header
 * @param {string[]} allowed entries from {@link parseAllowedOrigins}
 * @returns {boolean}
 */
export function originAllowed(origin, allowed) {
    if (!origin) return false;
    for (const entry of allowed) {
        if (!entry.includes('*')) {
            if (entry === origin) return true;
            continue;
        }
        const star = entry.indexOf('*');
        const prefix = entry.slice(0, star);
        const suffix = entry.slice(star + 1);
        if (
            origin.startsWith(prefix) &&
            origin.endsWith(suffix) &&
            origin.length > prefix.length + suffix.length
        ) {
            return true;
        }
    }
    return false;
}

/**
 * CORS response headers for an allowed origin (empty object otherwise).
 * @param {Request} request
 * @param {string[]} allowed
 * @returns {Record<string, string>}
 */
export function corsHeaders(request, allowed) {
    const origin = request.headers.get('Origin');
    if (!originAllowed(origin, allowed)) return {};
    return {
        'Access-Control-Allow-Origin': /** @type {string} */ (origin),
        'Access-Control-Allow-Credentials': 'true',
        Vary: 'Origin'
    };
}

/**
 * Handle a CORS preflight request.
 * @param {Request} request
 * @param {string[]} allowed
 * @returns {Response}
 */
export function preflightResponse(request, allowed) {
    const headers = corsHeaders(request, allowed);
    if (!headers['Access-Control-Allow-Origin']) {
        return new Response(null, { status: 403 });
    }
    return new Response(null, {
        status: 204,
        headers: {
            ...headers,
            'Access-Control-Allow-Methods':
                'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Max-Age': '86400'
        }
    });
}
