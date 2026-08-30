import { describe, expect, it } from 'vitest';
import {
    DOM_EVENTS,
    EVENT_NAMES,
    MESSAGE_NAMESPACE,
    MESSAGE_TYPES,
    PROTOCOL_VERSION,
    STATUSES
} from '@chalkcom/core/protocol';

describe('protocol constants', () => {
    it('pins the namespace and version', () => {
        expect(MESSAGE_NAMESPACE).toBe('chalkboard');
        expect(PROTOCOL_VERSION).toBe(1);
    });

    it('pins the message types', () => {
        expect(MESSAGE_TYPES).toEqual({
            READY: 'ready',
            INIT: 'init',
            NAVIGATE: 'navigate',
            RESIZE: 'resize',
            EVENT: 'event',
            JWT: 'jwt',
            CLOSE: 'close'
        });
    });

    it('pins the analytics event names', () => {
        expect(Object.values(EVENT_NAMES).sort()).toEqual(
            [
                'embed_view',
                'hint_click',
                'hint_impression',
                'overlay_open',
                'post_submit',
                'similar_clicked',
                'similar_shown',
                'vote'
            ].sort()
        );
    });

    it('pins statuses in roadmap order', () => {
        expect(STATUSES).toEqual([
            'open',
            'under_review',
            'planned',
            'in_progress',
            'complete',
            'closed'
        ]);
    });

    it('pins DOM event names', () => {
        expect(DOM_EVENTS).toEqual({
            SUBMITTED: 'chalk:submitted',
            VOTED: 'chalk:voted'
        });
    });

    it('freezes every constant object', () => {
        expect(Object.isFrozen(MESSAGE_TYPES)).toBe(true);
        expect(Object.isFrozen(EVENT_NAMES)).toBe(true);
        expect(Object.isFrozen(STATUSES)).toBe(true);
        expect(Object.isFrozen(DOM_EVENTS)).toBe(true);
    });
});
