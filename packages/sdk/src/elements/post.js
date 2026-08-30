/**
 * <chalk-post> — a vote card for one specific post ("Bulk edit is planned —
 * vote to get notified"). Votes in place with the configured JWT, or opens
 * the post overlay when the visitor is not authenticated.
 *
 * Attributes: post (id or slug, required), cta-label, voted-label.
 */

import { DOM_EVENTS, EVENT_NAMES } from '@chalkcom/core/protocol';
import { apiGet, apiPost, state } from '../api.js';
import { track } from '../events.js';
import { openOverlay } from '../overlay.js';
import { BASE_STYLES, trackImpressionOnce } from './base.js';

export class ChalkPost extends HTMLElement {
    static observedAttributes = ['post'];

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        /** @type {any} */
        this.post = null;
        this.voted = false;
        this.busy = false;
    }

    connectedCallback() {
        this.render();
        this.load();
        trackImpressionOnce(this, {
            source: 'post',
            postId: this.getAttribute('post') ?? undefined
        });
    }

    attributeChangedCallback(_name, oldValue, newValue) {
        if (oldValue !== newValue && this.shadowRoot?.childNodes.length) {
            this.post = null;
            this.render();
            this.load();
        }
    }

    async load() {
        const idOrSlug = this.getAttribute('post');
        if (!idOrSlug) return;
        try {
            const res = await apiGet(
                `/api/v1/posts/${encodeURIComponent(idOrSlug)}`
            );
            this.post = res.post;
            this.voted = res.post.viewerHasVoted === true;
            this.render();
        } catch {
            // Render nothing useful without the post; keep the card quiet.
        }
    }

    render() {
        const root = /** @type {ShadowRoot} */ (this.shadowRoot);
        root.innerHTML = `<style>${BASE_STYLES}</style>`;
        const card = document.createElement('div');
        card.className = 'card';

        if (!this.post) {
            const loading = document.createElement('span');
            loading.className = 'muted';
            loading.textContent = this.getAttribute('loading-label') ?? '…';
            card.appendChild(loading);
            root.appendChild(card);
            return;
        }

        const title = document.createElement('div');
        title.textContent = this.post.title;
        card.appendChild(title);

        const meta = document.createElement('div');
        meta.className = 'desc';
        meta.textContent = `${this.post.voteCount} votes · ${this.post.status.replace('_', ' ')}`;
        card.appendChild(meta);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button';
        button.style.marginTop = '8px';
        button.textContent = this.voted
            ? (this.getAttribute('voted-label') ?? 'Voted ✓')
            : (this.getAttribute('cta-label') ?? 'Vote for this');
        button.addEventListener('click', () => this.vote());
        card.appendChild(button);

        root.appendChild(card);
    }

    async vote() {
        if (!this.post || this.voted || this.busy) return;
        if (!state.jwt) {
            // No identity — let them vote (and sign in) inside the overlay.
            openOverlay({ page: 'post', postId: this.post.slug });
            return;
        }
        // Optimistic: flip immediately, reconcile or roll back after.
        this.voted = true;
        this.post.voteCount += 1;
        this.busy = true;
        this.render();
        try {
            const res = await apiPost(`/api/v1/posts/${this.post.id}/vote`, {});
            this.post.voteCount = res.voteCount;
            track(EVENT_NAMES.VOTE, { source: 'post', postId: this.post.id });
            this.dispatchEvent(
                new CustomEvent(DOM_EVENTS.VOTED, {
                    detail: { postId: this.post.id },
                    bubbles: true,
                    composed: true
                })
            );
        } catch {
            this.voted = false;
            this.post.voteCount -= 1;
        } finally {
            this.busy = false;
            this.render();
        }
    }
}
