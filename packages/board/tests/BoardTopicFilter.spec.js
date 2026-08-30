import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import BoardView from '../src/views/BoardView.vue';
import { embedState } from '../src/embed/embed.js';

/**
 * Stub fetch with canned responses; records every requested URL so tests
 * can assert on the query string sent to /api/v1/posts.
 */
function stubFetch() {
    /** @type {string[]} */
    const urls = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async url => {
            const path = String(url);
            urls.push(path);
            const body = path.startsWith('/api/v1/config')
                ? {
                      boardTitle: 'Feedback',
                      boards: [],
                      statuses: [],
                      topics: [],
                      theme: {},
                      assist: { enabled: false }
                  }
                : { posts: [], nextCursor: null };
            return new Response(JSON.stringify(body), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        })
    );
    return urls;
}

/** @param {string} path initial route, e.g. '/embed?topic=menu' */
async function mountBoard(path) {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', component: BoardView },
            { path: '/embed', component: BoardView },
            { path: '/:pathMatch(.*)*', component: BoardView }
        ]
    });
    router.push(path);
    await router.isReady();
    const wrapper = mount(BoardView, {
        global: { plugins: [router] }
    });
    await flushPromises();
    return wrapper;
}

/** @param {string[]} urls */
function lastPostsQuery(urls) {
    const posts = urls.filter(u => u.startsWith('/api/v1/posts?'));
    return new URLSearchParams(posts.at(-1)?.split('?')[1] ?? '');
}

beforeEach(() => {
    embedState.filters = {};
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('BoardView topic filter', () => {
    it('applies the ?topic= query the overlay opens with', async () => {
        const urls = stubFetch();
        await mountBoard('/embed?topic=menu');
        expect(lastPostsQuery(urls).get('topic')).toBe('menu');
    });

    it('applies init filters that arrive after mount', async () => {
        const urls = stubFetch();
        await mountBoard('/embed');
        expect(lastPostsQuery(urls).get('topic')).toBeNull();

        embedState.filters = { topic: 'reports' };
        await flushPromises();
        expect(lastPostsQuery(urls).get('topic')).toBe('reports');
    });

    it('keeps the URL topic when init carries no filters', async () => {
        const urls = stubFetch();
        await mountBoard('/embed?topic=menu');

        embedState.filters = {};
        await flushPromises();
        expect(lastPostsQuery(urls).get('topic')).toBe('menu');
    });
});
