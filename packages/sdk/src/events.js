/**
 * Analytics batching. Events queue up and flush to POST /api/v1/events —
 * periodically, when the batch cap is reached, and on pagehide via
 * sendBeacon so the last batch survives navigation.
 */

import { state, apiUrl } from './api.js';

const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 20;

/** @type {object[]} */
const queue = [];
/** @type {ReturnType<typeof setTimeout> | null} */
let timer = null;
let sessionId = '';
let wired = false;

function getSessionId() {
    if (!sessionId) {
        sessionId = crypto.randomUUID().slice(0, 16);
    }
    return sessionId;
}

/**
 * Queue an analytics event; also forwards to the host's onEvent callback.
 * @param {string} type one of the protocol EVENT_NAMES values
 * @param {Record<string, unknown>} [data] extra fields (topic, postId…)
 */
export function track(type, data = {}) {
    wireLifecycle();
    queue.push({
        type,
        source: 'sdk',
        sessionId: getSessionId(),
        url: window.location.href,
        ...data
    });
    state.onEvent?.(type, data);
    if (queue.length >= MAX_BATCH) {
        flush();
        return;
    }
    if (!timer) {
        timer = setTimeout(flush, FLUSH_INTERVAL_MS);
    }
}

/**
 * Send everything queued. With `useBeacon` (pagehide) the payload goes via
 * navigator.sendBeacon so it is not cancelled by the unload.
 * @param {boolean} [useBeacon]
 */
export function flush(useBeacon = false) {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
    if (queue.length === 0 || !state.url) return;
    const batch = queue.splice(0, MAX_BATCH);
    const body = JSON.stringify(batch);
    const url = apiUrl('/api/v1/events');
    if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(
            url,
            new Blob([body], { type: 'application/json' })
        );
    } else {
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true
        }).catch(() => {});
    }
    if (queue.length > 0) flush(useBeacon);
}

function wireLifecycle() {
    if (wired) return;
    wired = true;
    window.addEventListener('pagehide', () => flush(true));
}

/** Test hook: drop any queued events and timers. */
export function resetEventsForTest() {
    queue.length = 0;
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
}
