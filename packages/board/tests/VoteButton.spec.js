import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import VoteButton from '../src/components/VoteButton.vue';
import { session, setJwt } from '../src/api.js';

/** @param {Partial<Response> & { json?: () => Promise<any> }} impl */
function mockFetch(impl) {
    const spy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
        ...impl
    });
    vi.stubGlobal('fetch', spy);
    return spy;
}

beforeEach(() => {
    vi.unstubAllGlobals();
    setJwt('test-jwt');
    session.user = null;
});

describe('VoteButton', () => {
    it('optimistically increments, then reconciles with the server count', async () => {
        let resolveFetch;
        const spy = vi.fn().mockReturnValue(
            new Promise(resolve => {
                resolveFetch = resolve;
            })
        );
        vi.stubGlobal('fetch', spy);

        const wrapper = mount(VoteButton, {
            props: { postId: 'p1', voteCount: 3, viewerHasVoted: false }
        });
        await wrapper.find('button').trigger('click');
        // Optimistic state before the response lands.
        expect(wrapper.text()).toContain('4');
        expect(wrapper.find('button').attributes('aria-pressed')).toBe('true');

        resolveFetch({
            ok: true,
            status: 200,
            json: async () => ({
                postId: 'p1',
                voteCount: 7,
                viewerHasVoted: true
            })
        });
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('7');
        });
        expect(spy).toHaveBeenCalledWith(
            '/api/v1/posts/p1/vote',
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('rolls back the optimistic state when the request fails', async () => {
        mockFetch({ ok: false, status: 500 });
        const wrapper = mount(VoteButton, {
            props: { postId: 'p1', voteCount: 3, viewerHasVoted: false }
        });
        await wrapper.find('button').trigger('click');
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('3');
        });
        expect(wrapper.find('button').attributes('aria-pressed')).toBe('false');
    });

    it('unvotes with DELETE when already voted', async () => {
        const spy = mockFetch({
            json: async () => ({
                postId: 'p1',
                voteCount: 2,
                viewerHasVoted: false
            })
        });
        const wrapper = mount(VoteButton, {
            props: { postId: 'p1', voteCount: 3, viewerHasVoted: true }
        });
        await wrapper.find('button').trigger('click');
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('2');
        });
        expect(spy).toHaveBeenCalledWith(
            '/api/v1/posts/p1/vote',
            expect.objectContaining({ method: 'DELETE' })
        );
    });

    it('emits auth-required instead of calling the API when signed out', async () => {
        const spy = mockFetch({});
        setJwt(null);
        const wrapper = mount(VoteButton, {
            props: { postId: 'p1', voteCount: 3, viewerHasVoted: false }
        });
        await wrapper.find('button').trigger('click');
        expect(wrapper.emitted('auth-required')).toBeTruthy();
        expect(spy).not.toHaveBeenCalled();
    });
});
