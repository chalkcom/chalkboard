/**
 * Child side of the embed postMessage protocol. The board, loaded inside
 * the host page's iframe, announces `ready`, receives `init` (jwt, theme,
 * basePath, hostOrigin, filters), then reports `navigate`/`resize`/`event`
 * and accepts `jwt` refreshes and `navigate` commands.
 */

import {
    MESSAGE_NAMESPACE,
    MESSAGE_TYPES,
    PROTOCOL_VERSION
} from '@chalkcom/core/protocol';

/**
 * @param {{ onInit: (payload: any) => void, onJwt?: (jwt: string) => void, onNavigate?: (path: string) => void }} handlers
 * @returns {{ send: (type: string, payload?: object) => void, dispose: () => void }}
 */
export function createChildBus(handlers) {
    /** @type {string | null} set from init; validates later messages */
    let hostOrigin = null;

    /**
     * @param {string} type
     * @param {object} [payload]
     */
    function send(type, payload = {}) {
        if (!window.parent || window.parent === window) return;
        window.parent.postMessage(
            { ns: MESSAGE_NAMESPACE, v: PROTOCOL_VERSION, type, ...payload },
            // Until init tells us the host origin the only message we send
            // is `ready`, which carries nothing sensitive.
            hostOrigin ?? '*'
        );
    }

    /** @param {MessageEvent} event */
    function onMessage(event) {
        const data = event.data;
        if (!data || data.ns !== MESSAGE_NAMESPACE) return;
        if (data.type === MESSAGE_TYPES.INIT) {
            hostOrigin =
                typeof data.hostOrigin === 'string'
                    ? data.hostOrigin
                    : event.origin;
            handlers.onInit(data);
            return;
        }
        // Everything after init must come from the announced host origin.
        if (!hostOrigin || event.origin !== hostOrigin) return;
        if (data.type === MESSAGE_TYPES.JWT && typeof data.jwt === 'string') {
            handlers.onJwt?.(data.jwt);
        } else if (
            data.type === MESSAGE_TYPES.NAVIGATE &&
            typeof data.path === 'string'
        ) {
            handlers.onNavigate?.(data.path);
        }
    }

    window.addEventListener('message', onMessage);

    // Report content height so the host iframe can grow with us.
    const observer = new ResizeObserver(() => {
        send(MESSAGE_TYPES.RESIZE, {
            height: document.documentElement.scrollHeight
        });
    });
    observer.observe(document.documentElement);

    send(MESSAGE_TYPES.READY);

    return {
        send,
        dispose() {
            window.removeEventListener('message', onMessage);
            observer.disconnect();
        }
    };
}
