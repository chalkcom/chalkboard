import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGE_NAMESPACE, PROTOCOL_VERSION } from '@chalkcom/core/protocol';
import { createChildBus } from '../src/embed/bus.js';

/**
 * @param {object} data
 * @param {string} origin
 */
function deliver(data, origin) {
    window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

/** @param {object} [extra] */
function initMessage(extra = {}) {
    return {
        ns: MESSAGE_NAMESPACE,
        v: PROTOCOL_VERSION,
        type: 'init',
        jwt: 'token-1',
        hostOrigin: 'https://host.example.com',
        ...extra
    };
}

beforeEach(() => {
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            disconnect() {}
        }
    );
});

describe('createChildBus init validation', () => {
    it('accepts an init whose origin matches its claimed hostOrigin', () => {
        const onInit = vi.fn();
        const bus = createChildBus({ onInit });
        deliver(initMessage(), 'https://host.example.com');
        expect(onInit).toHaveBeenCalledTimes(1);
        bus.dispose();
    });

    it('ignores an init whose claimed hostOrigin does not match the sender', () => {
        const onInit = vi.fn();
        const bus = createChildBus({ onInit });
        deliver(initMessage({ jwt: 'stolen' }), 'https://evil.example.com');
        expect(onInit).not.toHaveBeenCalled();
        // The real host can still init afterwards.
        deliver(initMessage(), 'https://host.example.com');
        expect(onInit).toHaveBeenCalledTimes(1);
        bus.dispose();
    });

    it('accepts only the first init; later inits are ignored', () => {
        const onInit = vi.fn();
        const bus = createChildBus({ onInit });
        deliver(initMessage(), 'https://host.example.com');
        deliver(
            initMessage({
                jwt: 'swapped',
                hostOrigin: 'https://other.example'
            }),
            'https://other.example'
        );
        deliver(initMessage({ jwt: 'again' }), 'https://host.example.com');
        expect(onInit).toHaveBeenCalledTimes(1);
        expect(onInit.mock.calls[0][0].jwt).toBe('token-1');
        bus.dispose();
    });

    it('only honours post-init messages from the host origin', () => {
        const onJwt = vi.fn();
        const bus = createChildBus({ onInit: vi.fn(), onJwt });
        deliver(initMessage(), 'https://host.example.com');
        const jwtMessage = {
            ns: MESSAGE_NAMESPACE,
            v: PROTOCOL_VERSION,
            type: 'jwt',
            jwt: 'refreshed'
        };
        deliver(jwtMessage, 'https://evil.example.com');
        expect(onJwt).not.toHaveBeenCalled();
        deliver(jwtMessage, 'https://host.example.com');
        expect(onJwt).toHaveBeenCalledWith('refreshed');
        bus.dispose();
    });
});
