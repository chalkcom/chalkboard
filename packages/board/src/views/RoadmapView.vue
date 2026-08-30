<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api.js';
import { embedState, toEmbedPath } from '../embed/embed.js';
import VoteButton from '../components/VoteButton.vue';

const columns = ref([
    { id: 'planned', label: 'Planned', posts: [] },
    { id: 'in_progress', label: 'In progress', posts: [] },
    { id: 'complete', label: 'Complete', posts: [] }
]);
const error = ref(false);

onMounted(async () => {
    try {
        const res = await api('/api/v1/roadmap');
        for (const column of columns.value) {
            column.posts = res[column.id] ?? [];
        }
    } catch {
        error.value = true;
    }
});

/** @param {{ slug: string }} post */
function link(post) {
    const target = `/p/${post.slug}`;
    return embedState.active ? toEmbedPath(target) : target;
}
</script>

<template>
    <div>
        <h1 class="text-xl font-semibold">Roadmap</h1>
        <p v-if="error" class="mt-4 text-sm text-red-600">
            Could not load the roadmap.
        </p>
        <div class="mt-4 grid gap-4 md:grid-cols-3">
            <section
                v-for="column in columns"
                :key="column.id"
                :aria-label="column.label"
            >
                <h2 class="text-sm font-semibold text-muted">
                    {{ column.label }}
                    <span class="font-normal">({{ column.posts.length }})</span>
                </h2>
                <div class="mt-2 space-y-2">
                    <article
                        v-for="post in column.posts"
                        :key="post.id"
                        class="flex items-start gap-2 rounded-cb border border-edge bg-surface-raised p-3"
                    >
                        <VoteButton
                            :post-id="post.id"
                            :vote-count="post.voteCount"
                            :viewer-has-voted="post.viewerHasVoted === true"
                        />
                        <RouterLink
                            :to="link(post)"
                            class="min-w-0 text-sm font-medium hover:text-brand"
                        >
                            {{ post.title }}
                        </RouterLink>
                    </article>
                    <p
                        v-if="column.posts.length === 0"
                        class="text-xs text-muted"
                    >
                        Nothing here yet.
                    </p>
                </div>
            </section>
        </div>
    </div>
</template>
