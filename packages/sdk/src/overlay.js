/**
 * Right-hand slide-over overlay hosting the board in an iframe. Opened by
 * `Chalkboard('open', …)` and by the hint elements; closed by its backdrop,
 * the ESC key, or a `close` message from the board.
 */

import { EVENT_NAMES } from '@chalkcom/core/protocol';
import { track } from './events.js';
import { mountEmbed } from './embed.js';

/** @type {{ root: HTMLElement, embed: { unmount: () => void } } | null} */
let current = null;

/**
 * @param {{ page?: 'submit' | 'post' | 'board', topic?: string, postId?: string, prefillTitle?: string }} [options]
 * @returns {string} embed path for the requested page
 */
export function overlayPath({ page, topic, postId, prefillTitle } = {}) {
    if (page === 'post' && postId) {
        return `/embed/p/${encodeURIComponent(postId)}`;
    }
    if (page === 'submit') {
        const params = new URLSearchParams();
        if (prefillTitle) params.set('title', prefillTitle);
        if (topic) params.set('topic', topic);
        const query = params.toString();
        return `/embed/submit${query ? `?${query}` : ''}`;
    }
    return topic ? `/embed?topic=${encodeURIComponent(topic)}` : '/embed';
}

/**
 * Open the overlay (closing any previous one first).
 * @param {object} [options] see {@link overlayPath} plus embed options
 * @returns {boolean} whether the overlay opened
 */
export function openOverlay(options = {}) {
    closeOverlay();

    const root = document.createElement('div');
    root.setAttribute('data-chalkboard-overlay', '');
    root.style.cssText =
        'position:fixed;inset:0;z-index:2147483000;display:flex;' +
        'justify-content:flex-end;';

    const backdrop = document.createElement('div');
    backdrop.style.cssText =
        'position:absolute;inset:0;background:rgba(15,23,42,0.45);';
    backdrop.addEventListener('click', closeOverlay);

    const panel = document.createElement('div');
    panel.style.cssText =
        'position:relative;height:100%;width:min(440px,100vw);' +
        'background:#fff;box-shadow:-8px 0 30px rgba(0,0,0,0.2);';

    root.appendChild(backdrop);
    root.appendChild(panel);
    document.body.appendChild(root);

    const embed = mountEmbed(
        { ...options, container: panel },
        { overlay: true, path: overlayPath(options), onClose: closeOverlay }
    );
    if (!embed) {
        root.remove();
        return false;
    }
    embed.iframe.style.height = '100%';

    document.addEventListener('keydown', onKeydown);
    current = { root, embed };
    track(EVENT_NAMES.OVERLAY_OPEN, {
        topic: options.topic,
        postId: options.postId
    });
    return true;
}

/** @param {KeyboardEvent} event */
function onKeydown(event) {
    if (event.key === 'Escape') closeOverlay();
}

export function closeOverlay() {
    if (!current) return;
    document.removeEventListener('keydown', onKeydown);
    current.embed.unmount();
    current.root.remove();
    current = null;
}
