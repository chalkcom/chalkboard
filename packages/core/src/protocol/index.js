/**
 * Shared protocol constants for the Chalkboard embed and SDK.
 *
 * The parent (SDK) and child (board running in an iframe) exchange
 * postMessage payloads of the shape:
 *   { ns: MESSAGE_NAMESPACE, v: PROTOCOL_VERSION, type: <MESSAGE_TYPES>, ... }
 */

/** Namespace stamped on every postMessage payload. */
export const MESSAGE_NAMESPACE = 'chalkboard';

/** Protocol version; bumped only for breaking payload changes. */
export const PROTOCOL_VERSION = 1;

/** postMessage types exchanged between the SDK (parent) and board (child). */
export const MESSAGE_TYPES = Object.freeze({
    /** child → parent: iframe booted and is listening. */
    READY: 'ready',
    /** parent → child: configuration (jwt, basePath, hostOrigin, theme…). */
    INIT: 'init',
    /** both directions: route change inside the embed. */
    NAVIGATE: 'navigate',
    /** child → parent: content height changed. */
    RESIZE: 'resize',
    /** child → parent: analytics event to forward. */
    EVENT: 'event',
    /** parent → child: refreshed auth token. */
    JWT: 'jwt',
    /** child → parent: user asked to close the overlay. */
    CLOSE: 'close'
});

/** Analytics event names accepted by POST /api/v1/events. */
export const EVENT_NAMES = Object.freeze({
    HINT_IMPRESSION: 'hint_impression',
    HINT_CLICK: 'hint_click',
    OVERLAY_OPEN: 'overlay_open',
    SIMILAR_SHOWN: 'similar_shown',
    SIMILAR_CLICKED: 'similar_clicked',
    POST_SUBMIT: 'post_submit',
    VOTE: 'vote',
    EMBED_VIEW: 'embed_view',
    // AI interviewer funnel: offered → answered|skipped → applied.
    ASSIST_OFFERED: 'assist_offered',
    ASSIST_ANSWERED: 'assist_answered',
    ASSIST_SKIPPED: 'assist_skipped',
    ASSIST_APPLIED: 'assist_applied'
});

/** Post lifecycle statuses, in roadmap order. */
export const STATUSES = Object.freeze([
    'open',
    'under_review',
    'planned',
    'in_progress',
    'complete',
    'closed'
]);

/** DOM CustomEvent names dispatched by the SDK on the host page. */
export const DOM_EVENTS = Object.freeze({
    SUBMITTED: 'chalk:submitted',
    VOTED: 'chalk:voted'
});
