/**
 * Chalkboard SDK entry point. Exposes a single command function — mirroring
 * the `Featurebase('embed', {...})` call shape so existing host code ports
 * with a rename:
 *
 *   Chalkboard('config', { url, jwt, theme, onEvent })
 *   Chalkboard('embed', { container, initialPage, filters, jwt, … })
 *   Chalkboard('open', { page: 'submit', topic, prefillTitle })
 *   Chalkboard('navigate', '/roadmap')
 *   Chalkboard('unmount')
 *
 * A pre-load stub can queue calls in window.Chalkboard.q; they drain when
 * this script evaluates.
 */

import { MESSAGE_TYPES } from '@chalkcom/core/protocol';
import { configure } from './api.js';
import { mountEmbed } from './embed.js';
import { openOverlay, closeOverlay } from './overlay.js';
import { ChalkHint } from './elements/hint.js';
import { ChalkTopic } from './elements/topic.js';
import { ChalkPost } from './elements/post.js';

/** @type {ReturnType<typeof mountEmbed> | null} */
let activeEmbed = null;

/** @type {Record<string, (payload?: any) => unknown>} */
const COMMANDS = {
    config(payload) {
        configure(payload);
    },
    embed(payload = {}) {
        // The embed's config (url, jwt, theme…) doubles as global config so
        // hint elements and analytics work with a single call.
        configure(payload);
        activeEmbed?.unmount();
        activeEmbed = mountEmbed(payload);
        return activeEmbed;
    },
    open(payload) {
        return openOverlay(payload ?? {});
    },
    navigate(path) {
        if (typeof path === 'string') {
            activeEmbed?.bus.send(MESSAGE_TYPES.NAVIGATE, { path });
        }
    },
    unmount() {
        closeOverlay();
        activeEmbed?.unmount();
        activeEmbed = null;
    }
};

/**
 * The global command function.
 * @param {string} command
 * @param {unknown} [payload]
 * @returns {unknown}
 */
function Chalkboard(command, payload) {
    const handler = COMMANDS[command];
    if (!handler) return undefined;
    return handler(payload);
}

function registerElements() {
    if (typeof window === 'undefined' || !window.customElements) return;
    const elements = [
        ['chalk-hint', ChalkHint],
        ['chalk-topic', ChalkTopic],
        ['chalk-post', ChalkPost]
    ];
    for (const [tag, klass] of elements) {
        if (!window.customElements.get(tag)) {
            window.customElements.define(tag, klass);
        }
    }
}

/**
 * Install onto window: drain any stub queue, replace the stub, register
 * the custom elements.
 */
function install() {
    if (typeof window === 'undefined') return;
    const stub = /** @type {any} */ (window).Chalkboard;
    const queued = Array.isArray(stub?.q) ? [...stub.q] : [];
    /** @type {any} */ (window).Chalkboard = Chalkboard;
    registerElements();
    for (const args of queued) {
        Chalkboard(args[0], args[1]);
    }
}

install();

export default Chalkboard;
