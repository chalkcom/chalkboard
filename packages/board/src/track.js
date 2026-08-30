/**
 * Analytics from the board itself. In embed mode events are forwarded to
 * the host SDK (which batches them); in full-page mode they go straight to
 * the events endpoint, fire-and-forget.
 */

import { embedState, forwardEvent } from './embed/embed.js';

/**
 * @param {string} name a protocol EVENT_NAMES value
 * @param {Record<string, unknown>} [payload]
 */
export function trackEvent(name, payload = {}) {
    if (embedState.active) {
        forwardEvent(name, payload);
        return;
    }
    try {
        fetch('/api/v1/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{ type: name, source: 'board', ...payload }]),
            keepalive: true
        }).catch(() => {});
    } catch {
        // Analytics must never break the UI.
    }
}
