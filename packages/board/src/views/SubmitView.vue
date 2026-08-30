<script setup>
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api.js';
import { useConfig } from '../composables/useConfig.js';
import { embedState, forwardEvent, toEmbedPath } from '../embed/embed.js';
import StatusPill from '../components/StatusPill.vue';

const route = useRoute();
const router = useRouter();
const config = useConfig();

const title = ref(String(route.query.title ?? ''));
const body = ref('');
const topic = ref(String(route.query.topic ?? embedState.filters.topic ?? ''));
const similar = ref([]);
const submitting = ref(false);
const errorMessage = ref('');
/** @type {ReturnType<typeof setTimeout> | undefined} */
let similarTimer;

watch(title, value => {
    clearTimeout(similarTimer);
    if (value.trim().length < 3) {
        similar.value = [];
        return;
    }
    similarTimer = setTimeout(async () => {
        try {
            const res = await api(
                `/api/v1/similar?title=${encodeURIComponent(value.trim())}`
            );
            similar.value = res.posts;
            if (res.posts.length > 0) forwardEvent('similar_shown');
        } catch {
            similar.value = [];
        }
    }, 300);
});

/** @param {{ slug: string }} post */
function openSimilar(post) {
    forwardEvent('similar_clicked');
    const target = `/p/${post.slug}`;
    router.push(embedState.active ? toEmbedPath(target) : target);
}

async function submit() {
    if (submitting.value) return;
    submitting.value = true;
    errorMessage.value = '';
    try {
        const res = await api('/api/v1/posts', {
            method: 'POST',
            body: JSON.stringify({
                title: title.value.trim(),
                body: body.value,
                topic: topic.value || undefined,
                source: embedState.active ? 'embed' : 'board'
            })
        });
        forwardEvent('post_submit', { postId: res.post.id });
        const target = `/p/${res.post.slug}`;
        router.push(embedState.active ? toEmbedPath(target) : target);
    } catch (error) {
        errorMessage.value =
            error.status === 401
                ? 'Please sign in to post.'
                : error.status === 429
                  ? 'You are posting too fast — try again later.'
                  : 'Could not submit your post. Please try again.';
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <form class="max-w-xl" @submit.prevent="submit">
        <h1 class="text-xl font-semibold">Make a suggestion</h1>

        <label class="mt-4 block text-sm font-medium" for="cb-title"
            >Title</label
        >
        <input
            id="cb-title"
            v-model="title"
            required
            maxlength="200"
            class="mt-1 w-full rounded-cb border border-edge bg-surface-raised px-3 py-2 text-sm"
            placeholder="One sentence summary"
        />

        <div
            v-if="similar.length > 0"
            class="mt-2 rounded-cb border border-edge bg-surface-raised p-3"
        >
            <p class="text-xs font-medium text-muted">
                Similar ideas — maybe vote instead?
            </p>
            <ul class="mt-1 space-y-1">
                <li v-for="s in similar" :key="s.id">
                    <button
                        type="button"
                        class="flex w-full items-center gap-2 text-left text-sm hover:text-brand"
                        @click="openSimilar(s)"
                    >
                        <span class="truncate">{{ s.title }}</span>
                        <StatusPill :status="s.status" />
                        <span class="text-xs text-muted"
                            >▲ {{ s.voteCount }}</span
                        >
                    </button>
                </li>
            </ul>
        </div>

        <label class="mt-4 block text-sm font-medium" for="cb-body"
            >Details</label
        >
        <textarea
            id="cb-body"
            v-model="body"
            rows="5"
            maxlength="10000"
            class="mt-1 w-full rounded-cb border border-edge bg-surface-raised px-3 py-2 text-sm"
            placeholder="What problem would this solve? Markdown is supported."
        ></textarea>

        <template v-if="config.topics.length > 0">
            <label class="mt-4 block text-sm font-medium" for="cb-topic"
                >Topic</label
            >
            <select
                id="cb-topic"
                v-model="topic"
                class="mt-1 rounded-cb border border-edge bg-surface-raised px-2 py-2 text-sm"
            >
                <option value="">Pick a topic (optional)</option>
                <option v-for="t in config.topics" :key="t.id" :value="t.id">
                    {{ t.label }}
                </option>
            </select>
        </template>

        <p v-if="errorMessage" class="mt-3 text-sm text-red-600">
            {{ errorMessage }}
        </p>
        <button
            type="submit"
            class="mt-4 rounded-cb bg-brand px-4 py-2 text-sm font-medium text-brand-contrast"
            :disabled="submitting"
        >
            {{ submitting ? 'Submitting…' : 'Submit suggestion' }}
        </button>
    </form>
</template>
