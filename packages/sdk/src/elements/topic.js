/**
 * <chalk-topic> — "4 open ideas for reports — vote or add yours". Fetches
 * the post count for a topic (sessionStorage-cached for 5 minutes) and
 * opens the board overlay filtered to that topic.
 *
 * Attributes: topic (required), label ("open ideas for reports"),
 * cta-label ("vote or add yours"), status (comma list, default open).
 */

import { EVENT_NAMES } from '@chalkcom/core/protocol';
import { apiGet } from '../api.js';
import { track } from '../events.js';
import { openOverlay } from '../overlay.js';
import { BASE_STYLES, trackImpressionOnce } from './base.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * @param {string} key
 * @returns {number | null}
 */
function readCachedCount(key) {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const { count, at } = JSON.parse(raw);
        if (Date.now() - at > CACHE_TTL_MS) return null;
        return typeof count === 'number' ? count : null;
    } catch {
        return null;
    }
}

/**
 * @param {string} key
 * @param {number} count
 */
function writeCachedCount(key, count) {
    try {
        sessionStorage.setItem(key, JSON.stringify({ count, at: Date.now() }));
    } catch {
        // Storage full or unavailable; the count is a nicety.
    }
}

export class ChalkTopic extends HTMLElement {
    static observedAttributes = ['topic', 'label', 'cta-label', 'status'];

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        /** @type {number | null} */
        this.count = null;
    }

    connectedCallback() {
        this.render();
        this.loadCount();
        trackImpressionOnce(this, {
            source: 'topic',
            topic: this.getAttribute('topic') ?? undefined
        });
    }

    attributeChangedCallback() {
        if (this.shadowRoot?.childNodes.length) {
            this.render();
            this.loadCount();
        }
    }

    async loadCount() {
        const topic = this.getAttribute('topic');
        if (!topic) return;
        const status = this.getAttribute('status') ?? 'open';
        const cacheKey = `chalk-topic:${topic}:${status}`;
        const cached = readCachedCount(cacheKey);
        if (cached !== null) {
            this.count = cached;
            this.render();
            return;
        }
        try {
            const res = await apiGet(
                `/api/v1/posts/count?topic=${encodeURIComponent(topic)}` +
                    `&status=${encodeURIComponent(status)}`
            );
            this.count = res.count;
            writeCachedCount(cacheKey, res.count);
            this.render();
        } catch {
            // Leave the count off rather than showing an error.
        }
    }

    render() {
        const label = this.getAttribute('label') ?? 'open ideas';
        const cta = this.getAttribute('cta-label') ?? 'vote or add yours';
        const root = /** @type {ShadowRoot} */ (this.shadowRoot);
        root.innerHTML = `<style>${BASE_STYLES}</style>`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'link';

        if (this.count !== null) {
            const count = document.createElement('span');
            count.className = 'count';
            count.textContent = String(this.count);
            button.appendChild(count);
            button.appendChild(document.createTextNode(` ${label} — ${cta}`));
        } else {
            button.textContent = `${label} — ${cta}`;
        }
        button.addEventListener('click', () => this.open());
        root.appendChild(button);
    }

    open() {
        const topic = this.getAttribute('topic') ?? undefined;
        track(EVENT_NAMES.HINT_CLICK, { source: 'topic', topic });
        openOverlay({ page: 'board', topic });
    }
}
