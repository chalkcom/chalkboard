import { beforeEach, describe, expect, it, vi } from 'vitest';
// One import for the whole file: the custom element classes registered on
// this window must keep pointing at this module registry's live state.
import Chalkboard from '../src/index.js';
import { resetEventsForTest } from '../src/events.js';

beforeEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    sessionStorage.clear();
    resetEventsForTest();
    Chalkboard('unmount');
    Chalkboard('config', {
        url: 'https://feedback.example.com',
        jwt: null,
        onEvent: null
    });
});

describe('chalk-hint', () => {
    it('renders its label and variant from attributes', () => {
        document.body.innerHTML =
            '<chalk-hint variant="button" label="Tell us what is missing">' +
            '</chalk-hint>';
        const hint = document.querySelector('chalk-hint');
        const button = hint.shadowRoot.querySelector('button');
        expect(button.textContent).toBe('Tell us what is missing');
        expect(button.className).toBe('button');
    });

    it('re-renders when attributes change', () => {
        document.body.innerHTML = '<chalk-hint label="Before"></chalk-hint>';
        const hint = document.querySelector('chalk-hint');
        hint.setAttribute('label', 'After');
        expect(hint.shadowRoot.querySelector('button').textContent).toBe(
            'After'
        );
    });

    it('opens the prefilled submit overlay on click', () => {
        document.body.innerHTML =
            '<chalk-hint label="Hi" topic="reports" prefill-title="CSV export">' +
            '</chalk-hint>';
        document
            .querySelector('chalk-hint')
            .shadowRoot.querySelector('button')
            .click();
        const overlay = document.querySelector('[data-chalkboard-overlay]');
        expect(overlay).toBeTruthy();
        const iframe = overlay.querySelector('iframe');
        expect(iframe.src).toContain('/embed/submit');
        expect(iframe.src).toContain('title=CSV+export');
        expect(iframe.src).toContain('topic=reports');

        Chalkboard('unmount');
        expect(document.querySelector('[data-chalkboard-overlay]')).toBeNull();
    });
});

describe('chalk-topic', () => {
    it('renders the fetched count with attribute copy and caches it', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ count: 4 })
        });
        vi.stubGlobal('fetch', fetchSpy);

        document.body.innerHTML =
            '<chalk-topic topic="reports" label="open ideas for reports"' +
            ' cta-label="vote or add yours"></chalk-topic>';
        const el = document.querySelector('chalk-topic');
        await vi.waitFor(() => {
            expect(el.shadowRoot.textContent).toContain(
                '4 open ideas for reports — vote or add yours'
            );
        });
        expect(fetchSpy).toHaveBeenCalledWith(
            'https://feedback.example.com/api/v1/posts/count?topic=reports&status=open',
            expect.anything()
        );

        // A second element on the same pageview uses the session cache.
        fetchSpy.mockClear();
        const second = document.createElement('chalk-topic');
        second.setAttribute('topic', 'reports');
        second.setAttribute('label', 'open ideas');
        document.body.appendChild(second);
        await vi.waitFor(() => {
            expect(second.shadowRoot.textContent).toContain('4 open ideas');
        });
        expect(
            fetchSpy.mock.calls.filter(([url]) =>
                String(url).includes('/posts/count')
            )
        ).toHaveLength(0);
    });
});

describe('chalk-post', () => {
    const postResponse = {
        ok: true,
        json: async () => ({
            post: {
                id: 'p1',
                slug: 'bulk-edit',
                title: 'Bulk edit',
                status: 'planned',
                voteCount: 12,
                viewerHasVoted: false
            }
        })
    };

    it('renders a vote card and votes optimistically with a JWT', async () => {
        const fetchSpy = vi.fn(async (url, init) => {
            if (String(url).includes('/vote')) {
                expect(init.headers.Authorization).toBe('Bearer host-jwt');
                return {
                    ok: true,
                    json: async () => ({
                        postId: 'p1',
                        voteCount: 13,
                        viewerHasVoted: true
                    })
                };
            }
            return postResponse;
        });
        vi.stubGlobal('fetch', fetchSpy);
        Chalkboard('config', { jwt: 'host-jwt' });

        document.body.innerHTML = '<chalk-post post="bulk-edit"></chalk-post>';
        const el = document.querySelector('chalk-post');
        await vi.waitFor(() => {
            expect(el.shadowRoot.textContent).toContain('Bulk edit');
            expect(el.shadowRoot.textContent).toContain('12 votes');
        });

        el.shadowRoot.querySelector('button.button').click();
        await vi.waitFor(() => {
            expect(el.shadowRoot.textContent).toContain('13 votes');
            expect(el.shadowRoot.textContent).toContain('Voted ✓');
        });
    });

    it('opens the post overlay instead when unauthenticated', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(postResponse));

        document.body.innerHTML = '<chalk-post post="bulk-edit"></chalk-post>';
        const el = document.querySelector('chalk-post');
        await vi.waitFor(() => {
            expect(el.shadowRoot.textContent).toContain('Bulk edit');
        });
        el.shadowRoot.querySelector('button.button').click();
        const overlay = document.querySelector('[data-chalkboard-overlay]');
        expect(overlay).toBeTruthy();
        expect(overlay.querySelector('iframe').src).toContain(
            '/embed/p/bulk-edit'
        );
        Chalkboard('unmount');
    });
});
