import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import PostView from '../src/views/PostView.vue';
import { session, setJwt } from '../src/api.js';

const STATUSES = [
    'open',
    'under_review',
    'planned',
    'in_progress',
    'complete',
    'closed'
];

const CONFIG = {
    boardTitle: 'T',
    boards: [],
    statuses: STATUSES,
    topics: [],
    theme: {},
    assist: { enabled: false }
};

function makePost(status = 'open') {
    return {
        id: 'p1',
        slug: 'my-post',
        title: 'My post',
        status,
        voteCount: 3,
        viewerHasVoted: false,
        commentCount: 0,
        tags: [],
        bodyHtml: '<p>body</p>',
        authorName: 'Ada',
        createdAt: '2026-01-01T00:00:00.000Z'
    };
}

/**
 * Fetch stub with per-path handlers; records every call for assertions.
 * @param {Record<string, (init: any) => unknown>} handlers keyed by path
 *   prefix; return value is JSON-encoded into a 200 response
 */
function stubFetch(handlers) {
    const calls = [];
    const spy = vi.fn(async (url, init = {}) => {
        const path = String(url);
        calls.push({ path, init });
        for (const [prefix, handler] of Object.entries(handlers)) {
            if (path.startsWith(prefix)) {
                const result = handler(init);
                if (result instanceof Response) return result;
                return new Response(JSON.stringify(result), {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                });
            }
        }
        return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', spy);
    return { spy, calls };
}

function defaultHandlers(overrides = {}) {
    return {
        '/api/v1/config': () => CONFIG,
        '/api/v1/posts/p1/comments': () => ({ comments: [] }),
        '/api/v1/posts/p1/status': init => ({
            post: makePost(JSON.parse(init.body).status)
        }),
        '/api/v1/posts/p1': () => ({ post: makePost() }),
        '/api/v1/posts/my-post': () => ({ post: makePost() }),
        ...overrides
    };
}

async function mountPost() {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/p/:slug', component: PostView },
            { path: '/', component: { template: '<div />' } }
        ]
    });
    await router.push('/p/my-post');
    await router.isReady();
    const wrapper = mount(PostView, { global: { plugins: [router] } });
    await vi.waitFor(() => {
        expect(wrapper.find('h1').exists()).toBe(true);
    });
    return wrapper;
}

beforeEach(() => {
    vi.unstubAllGlobals();
    setJwt('test-jwt');
    session.user = null;
});

describe('staff status select on the post page', () => {
    it('shows every status with the current one selected for staff', async () => {
        stubFetch(defaultHandlers());
        session.user = { id: 'u1', isStaff: true };
        const wrapper = await mountPost();

        const select = wrapper.find('[data-status-select]');
        expect(select.exists()).toBe(true);
        const options = select.findAll('option');
        expect(options.map(o => o.attributes('value'))).toEqual(STATUSES);
        expect(options.map(o => o.text())).toEqual([
            'Open',
            'Under review',
            'Planned',
            'In progress',
            'Complete',
            'Closed'
        ]);
        expect(select.element.value).toBe('open');
    });

    it('renders the plain pill, not a select, for members', async () => {
        stubFetch(defaultHandlers());
        session.user = { id: 'u2', isStaff: false };
        const wrapper = await mountPost();

        expect(wrapper.find('[data-status-select]').exists()).toBe(false);
        expect(wrapper.text()).toContain('Open');
    });

    it('renders the plain pill for anonymous visitors', async () => {
        stubFetch(defaultHandlers());
        const wrapper = await mountPost();

        expect(wrapper.find('[data-status-select]').exists()).toBe(false);
        expect(wrapper.text()).toContain('Open');
    });

    it('PATCHes the new status and updates the visible status', async () => {
        const { calls } = stubFetch(defaultHandlers());
        session.user = { id: 'u1', isStaff: true };
        const wrapper = await mountPost();

        await wrapper.find('[data-status-select]').setValue('planned');
        const patch = await vi.waitFor(() => {
            const found = calls.find(c =>
                c.path.startsWith('/api/v1/posts/p1/status')
            );
            expect(found).toBeTruthy();
            return found;
        });
        expect(patch.init.method).toBe('PATCH');
        expect(JSON.parse(patch.init.body)).toEqual({ status: 'planned' });
        await vi.waitFor(() => {
            expect(wrapper.find('[data-status-select]').element.value).toBe(
                'planned'
            );
        });
        expect(wrapper.find('[data-status-error]').exists()).toBe(false);
    });

    it('reverts and shows an inline error when the PATCH fails', async () => {
        stubFetch(
            defaultHandlers({
                '/api/v1/posts/p1/status': () =>
                    new Response('{}', { status: 500 })
            })
        );
        session.user = { id: 'u1', isStaff: true };
        const wrapper = await mountPost();

        await wrapper.find('[data-status-select]').setValue('complete');
        await vi.waitFor(() => {
            expect(wrapper.find('[data-status-error]').exists()).toBe(true);
        });
        expect(wrapper.find('[data-status-select]').element.value).toBe('open');
    });
});
