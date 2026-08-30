/** Shared plumbing for the <chalk-*> hint elements. */

import { EVENT_NAMES } from '@chalkcom/core/protocol';
import { track } from '../events.js';

/**
 * Shared shadow stylesheet. All theming happens through the --chalk-*
 * custom properties, which inherit through the shadow boundary.
 */
export const BASE_STYLES = `
:host {
    display: inline-block;
    font-family: var(--chalk-font, inherit);
    color: var(--chalk-fg, inherit);
    line-height: 1.4;
}
button {
    font: inherit;
    cursor: pointer;
}
.link {
    background: none;
    border: none;
    padding: 0;
    color: var(--chalk-brand, #4f46e5);
    text-decoration: underline;
}
.button {
    background: var(--chalk-brand, #4f46e5);
    color: var(--chalk-bg, #fff);
    border: none;
    border-radius: var(--chalk-radius, 6px);
    padding: 6px 12px;
}
.card {
    display: block;
    width: 100%;
    text-align: left;
    background: var(--chalk-bg, #fff);
    color: var(--chalk-fg, inherit);
    border: 1px solid var(--chalk-muted, #cbd5e1);
    border-radius: var(--chalk-radius, 6px);
    padding: 10px 12px;
}
.card .desc, .muted {
    color: var(--chalk-muted, #64748b);
    font-size: 0.85em;
}
.count {
    font-weight: 600;
}
`;

/**
 * Track one impression per element per pageview, when the element first
 * becomes visible (falls back to "now" without IntersectionObserver).
 * @param {HTMLElement} element
 * @param {Record<string, unknown>} data
 */
export function trackImpressionOnce(element, data) {
    const tracked = /** @type {any} */ (element);
    if (tracked.__chalkImpression) return;
    tracked.__chalkImpression = true;
    if (typeof IntersectionObserver === 'undefined') {
        track(EVENT_NAMES.HINT_IMPRESSION, data);
        return;
    }
    const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
            observer.disconnect();
            track(EVENT_NAMES.HINT_IMPRESSION, data);
        }
    });
    observer.observe(element);
}
