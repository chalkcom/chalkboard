/**
 * Thin fetch client for the worker API. Auth is a Bearer JWT when the embed
 * host provided one via the postMessage `init`; otherwise the cb_session
 * cookie (set by /auth/sso) rides along automatically.
 */

import { reactive } from 'vue';

export const session = reactive({
    /** @type {string | null} JWT handed over by the embed host */
    jwt: null,
    /** @type {Record<string, unknown> | null} */
    user: null,
    userLoaded: false
});

/**
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<any>}
 * @throws {Error} on non-2xx responses (error.status carries the code)
 */
export async function api(path, init = {}) {
    const headers = new Headers(init.headers);
    if (session.jwt) headers.set('Authorization', `Bearer ${session.jwt}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, {
        ...init,
        headers,
        credentials: 'same-origin'
    });
    if (!response.ok) {
        const error = new Error(`API ${response.status} for ${path}`);
        error.status = response.status;
        throw error;
    }
    if (response.status === 204) return null;
    return response.json();
}

/** Load /users/me once; anonymous visitors resolve to null. */
export async function loadUser() {
    if (session.userLoaded) return session.user;
    try {
        const { user } = await api('/api/v1/users/me');
        session.user = user;
    } catch {
        session.user = null;
    }
    session.userLoaded = true;
    return session.user;
}

/** @param {string | null} jwt */
export function setJwt(jwt) {
    session.jwt = jwt;
    session.userLoaded = false;
}
