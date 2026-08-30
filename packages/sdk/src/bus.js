/**
 * Parent side of the embed postMessage protocol. Only messages from the
 * embed iframe's own window AND origin are accepted, and everything we send
 * pins targetOrigin to that origin.
 */

import {
    MESSAGE_NAMESPACE,
    MESSAGE_TYPES,
    PROTOCOL_VERSION
} from '@chalkcom/core/protocol';

/**
 * @param {HTMLIFrameElement} iframe
 * @param {string} childOrigin origin the board is served from
 * @param {{ onReady?: () => void, onResize?: (h: number) => void, onNavigate?: (path: string) => void, onEvent?: (name: string, payload: object) => void, onClose?: () => void }} handlers
 * @returns {{ send: (type: string, payload?: object) => void, dispose: () => void }}
 */
export function createParentBus(iframe, childOrigin, handlers) {
    /** @param {MessageEvent} event */
    function onMessage(event) {
        if (event.origin !== childOrigin) return;
        if (event.source !== iframe.contentWindow) return;
        const data = event.data;
        if (!data || data.ns !== MESSAGE_NAMESPACE) return;
        dispatch(data);
    }

    /** @type {Record<string, (data: any) => void>} */
    const dispatchTable = {
        [MESSAGE_TYPES.READY]: () => handlers.onReady?.(),
        [MESSAGE_TYPES.RESIZE]: data => {
            if (typeof data.height === 'number') {
                handlers.onResize?.(data.height);
            }
        },
        [MESSAGE_TYPES.NAVIGATE]: data => {
            if (typeof data.path === 'string') {
                handlers.onNavigate?.(data.path);
            }
        },
        [MESSAGE_TYPES.EVENT]: data => {
            if (typeof data.event === 'string') {
                handlers.onEvent?.(data.event, data.payload ?? {});
            }
        },
        [MESSAGE_TYPES.CLOSE]: () => handlers.onClose?.()
    };

    /** @param {any} data */
    function dispatch(data) {
        dispatchTable[data.type]?.(data);
    }

    window.addEventListener('message', onMessage);

    return {
        /**
         * @param {string} type
         * @param {object} [payload]
         */
        send(type, payload = {}) {
            iframe.contentWindow?.postMessage(
                {
                    ns: MESSAGE_NAMESPACE,
                    v: PROTOCOL_VERSION,
                    type,
                    ...payload
                },
                childOrigin
            );
        },
        dispose() {
            window.removeEventListener('message', onMessage);
        }
    };
}
