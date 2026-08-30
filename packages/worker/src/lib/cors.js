/**
 * CORS handling. Origins are matched exactly against ALLOWED_ORIGINS; an
 * entry may use `*` only as a full-origin wildcard for one subdomain level
 * or more, e.g. `https://*--your-site.netlify.app`.
 *
 * Credentials (cookies) are only ever allowed for EXACT entries: a wildcard
 * match gets the origin echoed without `Access-Control-Allow-Credentials`,
 * so a broad suffix like `https://*.netlify.app` cannot let arbitrary sites
 * on shared hosting ride a visitor's session cookie.
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
 * How (if at all) an Origin matches the allow-list.
 * @param {string | null} origin the request's Origin header
 * @param {string[]} allowed entries from {@link parseAllowedOrigins}
 * @returns {'exact' | 'wildcard' | null}
 */
export function matchOrigin(origin, allowed) {
    if (!origin) return null;
    /** @type {'exact' | 'wildcard' | null} */
    let match = null;
    for (const entry of allowed) {
        if (!entry.includes('*')) {
            if (entry === origin) return 'exact';
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
            match = 'wildcard';
        }
    }
    return match;
}

/**
 * @param {string | null} origin
 * @param {string[]} allowed
 * @returns {boolean} whether the origin matches at all (exact or wildcard)
 */
export function originAllowed(origin, allowed) {
    return matchOrigin(origin, allowed) !== null;
}

/**
 * CORS response headers for an allowed origin (empty object otherwise).
 * Wildcard matches deliberately omit Allow-Credentials — see file header.
 * @param {Request} request
 * @param {string[]} allowed
 * @returns {Record<string, string>}
 */
export function corsHeaders(request, allowed) {
    const origin = request.headers.get('Origin');
    const match = matchOrigin(origin, allowed);
    if (!match) return {};
    /** @type {Record<string, string>} */
    const headers = {
        'Access-Control-Allow-Origin': /** @type {string} */ (origin),
        Vary: 'Origin'
    };
    if (match === 'exact') {
        headers['Access-Control-Allow-Credentials'] = 'true';
    }
    return headers;
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
