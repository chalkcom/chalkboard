/**
 * <chalk-hint> — an inline trigger the host app drops next to a feature
 * ("Missing something here? Tell us") that opens a prefilled submit overlay.
 *
 * Attributes: variant (link|button|card), label, description (card only),
 * topic, prefill-title. All copy comes from attributes so hosts fully
 * control the wording (and localisation).
 */

import { EVENT_NAMES } from '@chalkcom/core/protocol';
import { track } from '../events.js';
import { openOverlay } from '../overlay.js';
import { BASE_STYLES, trackImpressionOnce } from './base.js';

export class ChalkHint extends HTMLElement {
    static observedAttributes = ['variant', 'label', 'description', 'topic'];

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
        trackImpressionOnce(this, {
            source: 'hint',
            topic: this.getAttribute('topic') ?? undefined
        });
    }

    attributeChangedCallback() {
        if (this.shadowRoot?.childNodes.length) this.render();
    }

    render() {
        const variant = this.getAttribute('variant') ?? 'link';
        const label = this.getAttribute('label') ?? 'Suggest an improvement';
        const description = this.getAttribute('description');
        const klass = ['link', 'button', 'card'].includes(variant)
            ? variant
            : 'link';

        const root = /** @type {ShadowRoot} */ (this.shadowRoot);
        root.innerHTML = `<style>${BASE_STYLES}</style>`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = klass;
        button.textContent = label;
        if (klass === 'card' && description) {
            const desc = document.createElement('div');
            desc.className = 'desc';
            desc.textContent = description;
            button.appendChild(desc);
        }
        button.addEventListener('click', () => this.open());
        root.appendChild(button);
    }

    open() {
        const topic = this.getAttribute('topic') ?? undefined;
        track(EVENT_NAMES.HINT_CLICK, { source: 'hint', topic });
        openOverlay({
            page: 'submit',
            topic,
            prefillTitle: this.getAttribute('prefill-title') ?? undefined
        });
    }
}
