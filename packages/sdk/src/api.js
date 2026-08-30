/** SDK-wide configuration state and small fetch helpers. */

export const state = {
    /** Board origin, e.g. https://feedback.example.com */
    url: '',
    /** @type {string | null} host-app JWT forwarded to the board/API */
    jwt: null,
    /** @type {string | null} */
    locale: null,
    /** @type {Record<string, string> | null} theme forwarded to embeds */
    theme: null,
    /** @type {((name: string, payload: object) => void) | null} */
    onEvent: null
};

/**
 * Apply `Chalkboard('config', …)` options.
 * @param {{ url?: string, jwt?: string, locale?: string, theme?: object, onEvent?: Function }} [options]
 */
export function configure(options = {}) {
    if (typeof options.url === 'string') {
        state.url = options.url.replace(/\/$/, '');
    }
    if ('jwt' in options) state.jwt = options.jwt ?? null;
    if ('locale' in options) state.locale = options.locale ?? null;
    if ('theme' in options) state.theme = options.theme ?? null;
    if ('onEvent' in options) {
        state.onEvent =
            typeof options.onEvent === 'function' ? options.onEvent : null;
    }
}

/**
 * @param {string} path
 * @returns {string} absolute API URL on the configured board origin
 */
export function apiUrl(path) {
    return state.url + path;
}

/**
 * GET JSON from the board API (adds the Bearer JWT when configured).
 * @param {string} path
 * @returns {Promise<any>}
 */
export async function apiGet(path) {
    const headers = state.jwt
        ? { Authorization: `Bearer ${state.jwt}` }
        : undefined;
    const response = await fetch(apiUrl(path), { headers });
    if (!response.ok) {
        throw new Error(`Chalkboard API ${response.status}`);
    }
    return response.json();
}

/**
 * POST JSON to the board API.
 * @param {string} path
 * @param {unknown} body
 * @returns {Promise<any>}
 */
export async function apiPost(path, body) {
    /** @type {Record<string, string>} */
    const headers = { 'Content-Type': 'application/json' };
    if (state.jwt) headers.Authorization = `Bearer ${state.jwt}`;
    const response = await fetch(apiUrl(path), {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const error = new Error(`Chalkboard API ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return response.json();
}
