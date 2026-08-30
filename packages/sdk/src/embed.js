/** Inline board embed: an auto-resizing iframe wired to the child bus. */

import {
    DOM_EVENTS,
    EVENT_NAMES,
    MESSAGE_TYPES
} from '@chalkcom/core/protocol';
import { state } from './api.js';
import { createParentBus } from './bus.js';
import { track } from './events.js';

const PAGE_PATHS = {
    Board: '/embed',
    Roadmap: '/embed/roadmap',
    // Changelog is not built yet; fall back to the board.
    Changelog: '/embed'
};

/**
 * Dispatch host-page DOM events (chalk:submitted / chalk:voted) alongside
 * the analytics stream, so Vue/React/jQuery hosts can just addEventListener.
 * @param {string} name
 * @param {object} payload
 */
export function emitDomEvent(name, payload) {
    if (name === EVENT_NAMES.POST_SUBMIT) {
        window.dispatchEvent(
            new CustomEvent(DOM_EVENTS.SUBMITTED, { detail: payload })
        );
    } else if (name === EVENT_NAMES.VOTE) {
        window.dispatchEvent(
            new CustomEvent(DOM_EVENTS.VOTED, { detail: payload })
        );
    }
}

/**
 * Find the element to mount into: an explicit container (element or
 * selector), else [data-feedback-embed], else [data-featurebase-embed]
 * (drop-in compatibility with existing Featurebase markup).
 * @param {unknown} container
 * @returns {Element | null}
 */
export function resolveContainer(container) {
    if (container instanceof Element) return container;
    if (typeof container === 'string') {
        return document.querySelector(container);
    }
    return (
        document.querySelector('[data-feedback-embed]') ??
        document.querySelector('[data-featurebase-embed]')
    );
}

/**
 * Mount the board iframe.
 * @param {any} options `Chalkboard('embed', options)` payload
 * @param {{ onClose?: () => void, overlay?: boolean, path?: string }} [internal]
 * @returns {{ iframe: HTMLIFrameElement, bus: ReturnType<typeof createParentBus>, unmount: () => void } | null}
 */
export function mountEmbed(options = {}, internal = {}) {
    const url = options.url ? String(options.url) : state.url;
    if (!url) return null;
    const origin = new URL(url).origin;
    const container = internal.overlay
        ? options.container
        : resolveContainer(options.container);
    if (!container) return null;

    const path =
        internal.path ?? PAGE_PATHS[options.initialPage] ?? PAGE_PATHS.Board;
    const iframe = document.createElement('iframe');
    iframe.src = origin + path;
    iframe.title = 'Feedback board';
    iframe.style.border = '0';
    iframe.style.width = '100%';
    iframe.style.minHeight = internal.overlay ? '100%' : '480px';
    iframe.style.display = 'block';

    const jwt = options.jwt ?? options.featurebaseJwt ?? state.jwt;
    const bus = createParentBus(iframe, origin, {
        onReady() {
            bus.send(MESSAGE_TYPES.INIT, {
                jwt: jwt ?? null,
                basePath: options.basePath ?? null,
                hostOrigin: window.location.origin,
                theme: options.theme ?? state.theme ?? null,
                locale: options.locale ?? state.locale ?? null,
                filters: options.filters ?? {},
                hideMenu: Boolean(options.hideMenu),
                hideLogo: Boolean(options.hideLogo)
            });
        },
        onResize(height) {
            if (!internal.overlay) iframe.style.height = `${height}px`;
        },
        onEvent(name, payload) {
            track(name, payload);
            options.onEvent?.(name, payload);
            emitDomEvent(name, payload);
        },
        onClose() {
            internal.onClose?.();
        }
    });

    container.appendChild(iframe);
    if (!internal.overlay) track(EVENT_NAMES.EMBED_VIEW, {});

    return {
        iframe,
        bus,
        unmount() {
            bus.dispose();
            iframe.remove();
        }
    };
}
