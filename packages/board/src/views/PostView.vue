<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api.js';
import { embedState, toEmbedPath } from '../embed/embed.js';
import StatusPill from '../components/StatusPill.vue';
import VoteButton from '../components/VoteButton.vue';
import CommentThread from '../components/CommentThread.vue';

const route = useRoute();
const router = useRouter();
const post = ref(null);
const comments = ref([]);
const missing = ref(false);

async function load() {
    missing.value = false;
    try {
        const res = await api(`/api/v1/posts/${route.params.slug}`);
        if (res.post.mergedInto) {
            const target = `/p/${res.post.mergedInto.slug}`;
            router.replace(embedState.active ? toEmbedPath(target) : target);
            return;
        }
        post.value = res.post;
        await loadComments();
    } catch {
        missing.value = true;
    }
}

async function loadComments() {
    const res = await api(`/api/v1/posts/${post.value.id}/comments`);
    comments.value = res.comments;
    // Comment counts change with the thread; refresh the header number.
    const fresh = await api(`/api/v1/posts/${post.value.id}`);
    post.value = fresh.post;
}

onMounted(load);
watch(() => route.params.slug, load);
</script>

<template>
    <p v-if="missing" class="text-sm text-muted">This post does not exist.</p>
    <article v-else-if="post">
        <div class="flex items-start gap-4">
            <VoteButton
                :post-id="post.id"
                :vote-count="post.voteCount"
                :viewer-has-voted="post.viewerHasVoted === true"
            />
            <div class="min-w-0">
                <h1 class="text-xl font-semibold">{{ post.title }}</h1>
                <div class="mt-1 flex items-center gap-2 text-xs text-muted">
                    <StatusPill :status="post.status" />
                    <span v-if="post.authorName">{{ post.authorName }}</span>
                    <span>{{
                        new Date(post.createdAt).toLocaleDateString()
                    }}</span>
                    <span
                        v-for="tag in post.tags"
                        :key="tag.id"
                        class="rounded-full border border-edge px-2 py-0.5"
                    >
                        {{ tag.name }}
                    </span>
                </div>
            </div>
        </div>

        <!--
            bodyHtml is rendered by the worker with @chalkcom/core's
            escape-first markdown renderer, so it is safe to inject here.
        -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="cb-prose mt-4 text-sm" v-html="post.bodyHtml"></div>

        <h2 class="mt-8 text-sm font-semibold text-muted">
            {{ post.commentCount }}
            {{ post.commentCount === 1 ? 'comment' : 'comments' }}
        </h2>
        <CommentThread
            :post-id="post.id"
            :comments="comments"
            @changed="loadComments"
        />
    </article>
</template>
