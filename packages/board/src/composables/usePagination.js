/** Cursor pagination over a list endpoint returning { items, nextCursor }. */

import { ref } from 'vue';

/**
 * @param {(cursor: string | null) => Promise<{ items: unknown[], nextCursor: string | null }>} fetchPage
 * @returns {{
 *   items: import('vue').Ref<unknown[]>,
 *   loading: import('vue').Ref<boolean>,
 *   error: import('vue').Ref<boolean>,
 *   hasMore: import('vue').Ref<boolean>,
 *   reset: () => Promise<void>,
 *   loadMore: () => Promise<void>
 * }}
 */
export function usePagination(fetchPage) {
    const items = ref([]);
    const loading = ref(false);
    const error = ref(false);
    const nextCursor = ref(/** @type {string | null} */ (null));
    const hasMore = ref(false);

    /** @param {string | null} cursor */
    async function load(cursor) {
        if (loading.value) return;
        loading.value = true;
        error.value = false;
        try {
            const page = await fetchPage(cursor);
            items.value = cursor ? [...items.value, ...page.items] : page.items;
            nextCursor.value = page.nextCursor;
            hasMore.value = Boolean(page.nextCursor);
        } catch {
            error.value = true;
        } finally {
            loading.value = false;
        }
    }

    return {
        items,
        loading,
        error,
        hasMore,
        reset: () => load(null),
        loadMore: () => load(nextCursor.value)
    };
}
