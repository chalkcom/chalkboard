import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configure } from '../src/api.js';
import { flush, resetEventsForTest, track } from '../src/events.js';

beforeEach(() => {
    vi.unstubAllGlobals();
    resetEventsForTest();
    configure({ url: 'https://feedback.example.com', onEvent: null });
});

describe('event batching', () => {
    it('batches tracked events into one POST /api/v1/events call', () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({})
        });
        vi.stubGlobal('fetch', fetchSpy);

        track('hint_impression', { topic: 'reports' });
        track('hint_click', { topic: 'reports' });
        flush();

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://feedback.example.com/api/v1/events');
        expect(init.keepalive).toBe(true);
        const batch = JSON.parse(init.body);
        expect(batch).toHaveLength(2);
        expect(batch[0]).toMatchObject({
            type: 'hint_impression',
            topic: 'reports',
            source: 'sdk'
        });
        expect(batch[0].sessionId).toBeTruthy();
        expect(batch[0].url).toBeTruthy();
        expect(batch[1].type).toBe('hint_click');
    });

    it('splits oversized queues into API-sized batches', () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({})
        });
        vi.stubGlobal('fetch', fetchSpy);
        // 20 events auto-flush at the batch cap; 5 remain queued.
        for (let i = 0; i < 25; i += 1) track('hint_impression', {});
        flush();
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toHaveLength(20);
        expect(JSON.parse(fetchSpy.mock.calls[1][1].body)).toHaveLength(5);
    });

    it('forwards events to the configured onEvent callback', () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
        );
        const onEvent = vi.fn();
        configure({ onEvent });
        track('vote', { postId: 'p1' });
        expect(onEvent).toHaveBeenCalledWith('vote', { postId: 'p1' });
    });
});
