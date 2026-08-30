import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import SubmitView from '../src/views/SubmitView.vue';

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
                    status: init.method === 'POST' ? 200 : 200,
                    headers: { 'content-type': 'application/json' }
                });
            }
        }
        return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', spy);
    return { spy, calls };
}

/** Events POSTed to /api/v1/events, flattened to type names. */
function eventTypes(calls) {
    return calls
        .filter(c => c.path.startsWith('/api/v1/events'))
        .flatMap(c => JSON.parse(c.init.body).map(e => e.type));
}

/** Bodies POSTed to /api/v1/posts. */
function postBodies(calls) {
    return calls
        .filter(c => c.path === '/api/v1/posts' && c.init.method === 'POST')
        .map(c => JSON.parse(c.init.body));
}

async function mountSubmit() {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/submit', component: SubmitView },
            { path: '/p/:slug', component: { template: '<div />' } },
            { path: '/', component: { template: '<div />' } }
        ]
    });
    await router.push('/submit');
    await router.isReady();
    return mount(SubmitView, { global: { plugins: [router] } });
}

const CONFIG = {
    boardTitle: 'T',
    boards: [],
    statuses: [],
    topics: [],
    theme: {},
    assist: { enabled: true }
};

const QUESTIONS = {
    questions: [
        { id: 'q1', question: 'How often does this happen?' },
        { id: 'q2', question: 'What do you do instead today?' }
    ],
    model: 'claude-opus-5'
};

beforeEach(() => {
    vi.unstubAllGlobals();
});

describe('submit flow with the AI interviewer', () => {
    it('skip path: posts the original draft and fires assist_skipped', async () => {
        const { calls } = stubFetch({
            '/api/v1/config': () => CONFIG,
            '/api/v1/assist/interview': () => QUESTIONS,
            '/api/v1/posts': () => ({
                post: { id: 'p1', slug: 'my-draft' }
            })
        });
        const wrapper = await mountSubmit();
        // useConfig may already be loaded from an earlier test; force it.
        wrapper.vm.$nextTick();

        await wrapper.find('#cb-title').setValue('My draft');
        await wrapper.find('#cb-body').setValue('Original body');
        await wrapper.find('form').trigger('submit');
        await vi.waitFor(() => {
            expect(wrapper.find('[data-assist-skip]').exists()).toBe(true);
        });
        expect(eventTypes(calls)).toContain('assist_offered');
        expect(wrapper.text()).toContain('How often does this happen?');

        await wrapper.find('[data-assist-skip]').trigger('click');
        await vi.waitFor(() => {
            expect(postBodies(calls)).toHaveLength(1);
        });
        const posted = postBodies(calls)[0];
        expect(posted.title).toBe('My draft');
        expect(posted.body).toBe('Original body');
        expect(posted.interview).toBeUndefined();
        expect(eventTypes(calls)).toContain('assist_skipped');
        expect(eventTypes(calls)).toContain('post_submit');
        expect(eventTypes(calls)).not.toContain('assist_applied');
    });

    it('answer path: posts the edited synthesis with the interview payload', async () => {
        const { calls } = stubFetch({
            '/api/v1/config': () => CONFIG,
            '/api/v1/assist/interview': () => QUESTIONS,
            '/api/v1/assist/synthesize': () => ({
                synthesis: {
                    title: 'Add CSV export to orders',
                    body: 'Reconciling takes an hour weekly.'
                },
                duplicates: [],
                model: 'claude-opus-5'
            }),
            '/api/v1/posts': () => ({
                post: { id: 'p2', slug: 'add-csv-export-to-orders' }
            })
        });
        const wrapper = await mountSubmit();

        await wrapper.find('#cb-title').setValue('csv plz');
        await wrapper.find('#cb-body').setValue('want csv');
        await wrapper.find('form').trigger('submit');
        await vi.waitFor(() => {
            expect(wrapper.find('[data-assist-improve]').exists()).toBe(true);
        });

        await wrapper
            .find('textarea#assist-q1')
            .setValue('Every Monday when we reconcile.');
        await wrapper.find('[data-assist-improve]').trigger('click');

        // The AI draft lands in the editable fields, clearly labeled.
        await vi.waitFor(() => {
            expect(wrapper.find('[data-assist-review-note]').exists()).toBe(
                true
            );
        });
        expect(wrapper.find('#cb-title').element.value).toBe(
            'Add CSV export to orders'
        );
        expect(eventTypes(calls)).toContain('assist_answered');

        // The user edits the AI draft before posting.
        await wrapper
            .find('#cb-title')
            .setValue('Add CSV export to the orders page');
        await wrapper.find('form').trigger('submit');
        await vi.waitFor(() => {
            expect(postBodies(calls)).toHaveLength(1);
        });
        const posted = postBodies(calls)[0];
        expect(posted.title).toBe('Add CSV export to the orders page');
        expect(posted.interview.originalTitle).toBe('csv plz');
        expect(posted.interview.originalBody).toBe('want csv');
        expect(posted.interview.answers).toEqual([
            {
                question: 'How often does this happen?',
                answer: 'Every Monday when we reconcile.'
            }
        ]);
        expect(posted.interview.model).toBe('claude-opus-5');
        expect(eventTypes(calls)).toContain('assist_applied');
        expect(eventTypes(calls)).toContain('post_submit');
    });

    it('posts plainly when the interview returns no questions', async () => {
        const { calls } = stubFetch({
            '/api/v1/config': () => CONFIG,
            '/api/v1/assist/interview': () => ({ questions: [] }),
            '/api/v1/posts': () => ({
                post: { id: 'p3', slug: 'already-specific' }
            })
        });
        const wrapper = await mountSubmit();
        await wrapper.find('#cb-title').setValue('Already specific');
        await wrapper.find('form').trigger('submit');
        await vi.waitFor(() => {
            expect(postBodies(calls)).toHaveLength(1);
        });
        expect(postBodies(calls)[0].interview).toBeUndefined();
        expect(eventTypes(calls)).not.toContain('assist_offered');
    });

    it('degrades to a plain post when the interview call fails', async () => {
        const { calls } = stubFetch({
            '/api/v1/config': () => CONFIG,
            '/api/v1/assist/interview': () =>
                new Response('{}', { status: 503 }),
            '/api/v1/posts': () => ({
                post: { id: 'p4', slug: 'resilient' }
            })
        });
        const wrapper = await mountSubmit();
        await wrapper.find('#cb-title').setValue('Resilient');
        await wrapper.find('form').trigger('submit');
        await vi.waitFor(() => {
            expect(postBodies(calls)).toHaveLength(1);
        });
        expect(postBodies(calls)[0].title).toBe('Resilient');
    });
});
