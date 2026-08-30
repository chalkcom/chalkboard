<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api.js';
import { useConfig } from '../composables/useConfig.js';
import { usePagination } from '../composables/usePagination.js';
import { embedState, toEmbedPath } from '../embed/embed.js';
import PostRow from '../components/PostRow.vue';

const config = useConfig();
const route = useRoute();
const sort = ref('top');
const status = ref('');
// The overlay opens the board as /embed?topic=…, so the query is the
// filter source that exists at mount; init filters arrive later over
// postMessage (see the watcher below).
const topic = ref(String(route.query.topic ?? embedState.filters.topic ?? ''));
const search = ref('');
/** @type {ReturnType<typeof setTimeout> | undefined} */
let searchTimer;

const SORTS = [
    { id: 'top', label: 'Top' },
    { id: 'new', label: 'New' },
    { id: 'trending', label: 'Trending' }
];

const { items, loading, error, hasMore, reset, loadMore } = usePagination(
    async cursor => {
        const params = new URLSearchParams({ sort: sort.value, limit: '20' });
        if (status.value) params.set('status', status.value);
        if (topic.value) params.set('topic', topic.value);
        if (search.value.trim()) params.set('q', search.value.trim());
        if (cursor) params.set('cursor', cursor);
        const page = await api(`/api/v1/posts?${params}`);
        return { items: page.posts, nextCursor: page.nextCursor };
    }
);

const postLink = computed(() =>
    embedState.active ? p => toEmbedPath(`/p/${p.slug}`) : p => `/p/${p.slug}`
);

const submitLink = computed(() =>
    embedState.active ? toEmbedPath('/submit') : '/submit'
);

onMounted(reset);
watch([sort, status, topic], reset);
// The init message lands after this view mounts, so a one-shot read of
// embedState.filters would miss it; only an explicit topic may override
// the URL's.
watch(
    () => embedState.filters.topic,
    value => {
        if (typeof value === 'string') topic.value = value;
    }
);
watch(search, () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(reset, 250);
});
</script>

<template>
    <div>
        <div class="flex flex-wrap items-center gap-2">
            <nav class="flex gap-1" aria-label="Sort">
                <button
                    v-for="option in SORTS"
                    :key="option.id"
                    type="button"
                    class="rounded-cb px-3 py-1.5 text-sm"
                    :class="
                        sort === option.id
                            ? 'bg-brand text-brand-contrast'
                            : 'text-muted hover:bg-surface-raised'
                    "
                    @click="sort = option.id"
                >
                    {{ option.label }}
                </button>
            </nav>
            <select
                v-model="status"
                class="rounded-cb border border-edge bg-surface-raised px-2 py-1.5 text-sm"
                aria-label="Filter by status"
            >
                <option value="">All statuses</option>
                <option v-for="s in config.statuses" :key="s" :value="s">
                    {{ s.replace('_', ' ') }}
                </option>
            </select>
            <select
                v-if="config.topics.length > 0"
                v-model="topic"
                class="rounded-cb border border-edge bg-surface-raised px-2 py-1.5 text-sm"
                aria-label="Filter by topic"
            >
                <option value="">All topics</option>
                <option v-for="t in config.topics" :key="t.id" :value="t.id">
                    {{ t.label }}
                </option>
            </select>
            <input
                v-model="search"
                type="search"
                placeholder="Search…"
                class="min-w-40 flex-1 rounded-cb border border-edge bg-surface-raised px-3 py-1.5 text-sm"
                aria-label="Search posts"
            />
            <RouterLink
                :to="submitLink"
                class="rounded-cb bg-brand px-3 py-1.5 text-sm font-medium text-brand-contrast"
            >
                Make a suggestion
            </RouterLink>
        </div>

        <p v-if="error" class="mt-6 text-sm text-red-600">
            Could not load posts. Please try again.
        </p>
        <div class="mt-4 space-y-2">
            <PostRow
                v-for="post in items"
                :key="post.id"
                :post="post"
                :to="postLink(post)"
            />
        </div>
        <p
            v-if="!loading && !error && items.length === 0"
            class="mt-6 text-sm text-muted"
        >
            No posts yet — be the first to make a suggestion.
        </p>
        <button
            v-if="hasMore"
            type="button"
            class="mt-4 w-full rounded-cb border border-edge bg-surface-raised py-2 text-sm"
            :disabled="loading"
            @click="loadMore"
        >
            {{ loading ? 'Loading…' : 'Load more' }}
        </button>
    </div>
</template>
