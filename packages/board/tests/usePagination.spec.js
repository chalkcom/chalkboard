import { describe, expect, it, vi } from 'vitest';
import { usePagination } from '../src/composables/usePagination.js';

describe('usePagination', () => {
    it('loads the first page and appends subsequent pages', async () => {
        const fetchPage = vi
            .fn()
            .mockResolvedValueOnce({ items: [1, 2], nextCursor: 'c1' })
            .mockResolvedValueOnce({ items: [3], nextCursor: null });
        const { items, hasMore, reset, loadMore } = usePagination(fetchPage);

        await reset();
        expect(items.value).toEqual([1, 2]);
        expect(hasMore.value).toBe(true);

        await loadMore();
        expect(fetchPage).toHaveBeenLastCalledWith('c1');
        expect(items.value).toEqual([1, 2, 3]);
        expect(hasMore.value).toBe(false);
    });

    it('replaces items on reset', async () => {
        const fetchPage = vi
            .fn()
            .mockResolvedValueOnce({ items: [1], nextCursor: 'c1' })
            .mockResolvedValueOnce({ items: [9], nextCursor: null });
        const { items, reset } = usePagination(fetchPage);
        await reset();
        await reset();
        expect(items.value).toEqual([9]);
        expect(fetchPage).toHaveBeenLastCalledWith(null);
    });

    it('flags errors and keeps existing items', async () => {
        const fetchPage = vi
            .fn()
            .mockResolvedValueOnce({ items: [1], nextCursor: 'c1' })
            .mockRejectedValueOnce(new Error('boom'));
        const { items, error, reset, loadMore } = usePagination(fetchPage);
        await reset();
        await loadMore();
        expect(error.value).toBe(true);
        expect(items.value).toEqual([1]);
    });

    it('ignores concurrent loads while one is in flight', async () => {
        let resolvePage;
        const fetchPage = vi.fn().mockReturnValue(
            new Promise(resolve => {
                resolvePage = resolve;
            })
        );
        const { reset } = usePagination(fetchPage);
        const first = reset();
        const second = reset();
        resolvePage({ items: [], nextCursor: null });
        await Promise.all([first, second]);
        expect(fetchPage).toHaveBeenCalledTimes(1);
    });
});
