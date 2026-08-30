/**
 * Embed-mode state and wiring: routes under /embed/* render chrome-less and
 * talk to the host page through the child bus.
 */

import { reactive } from 'vue';
import { MESSAGE_TYPES } from '@chalkcom/core/protocol';
import { setJwt } from '../api.js';
import { applyTheme } from '../theme.js';
import { createChildBus } from './bus.js';

export const embedState = reactive({
    active: false,
    /** @type {Record<string, unknown>} filters from init (topic, board…) */
    filters: {},
    hideMenu: false,
    hideLogo: false
});

/** @type {ReturnType<typeof createChildBus> | null} */
let bus = null;

/**
 * Boot the child protocol. Called once by main.js when the route is under
 * /embed/*.
 * @param {import('vue-router').Router} router
 */
export function startEmbed(router) {
    embedState.active = true;
    bus = createChildBus({
        onInit(payload) {
            if (typeof payload.jwt === 'string') setJwt(payload.jwt);
            applyTheme(payload.theme);
            if (payload.filters && typeof payload.filters === 'object') {
                embedState.filters = payload.filters;
            }
            embedState.hideMenu = Boolean(payload.hideMenu);
            embedState.hideLogo = Boolean(payload.hideLogo);
            if (typeof payload.basePath === 'string' && payload.basePath) {
                router.replace(toEmbedPath(payload.basePath));
            }
        },
        onJwt(jwt) {
            setJwt(jwt);
        },
        onNavigate(path) {
            router.push(toEmbedPath(path));
        }
    });

    router.afterEach(to => {
        bus?.send(MESSAGE_TYPES.NAVIGATE, {
            path: to.path.replace(/^\/embed/, '') || '/'
        });
    });
}

/**
 * Forward an analytics event to the host page (which batches to the API).
 * @param {string} name
 * @param {Record<string, unknown>} [payload]
 */
export function forwardEvent(name, payload = {}) {
    bus?.send(MESSAGE_TYPES.EVENT, { event: name, payload });
}

/** Ask the host to close the overlay (no-op in full-page mode). */
export function requestClose() {
    bus?.send(MESSAGE_TYPES.CLOSE);
}

/**
 * @param {string} path board-relative path like `/roadmap`
 * @returns {string}
 */
export function toEmbedPath(path) {
    const clean = path.startsWith('/') ? path : `/${path}`;
    return clean.startsWith('/embed') ? clean : `/embed${clean}`;
}
