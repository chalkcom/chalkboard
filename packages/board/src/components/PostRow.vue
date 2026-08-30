<script setup>
import StatusPill from './StatusPill.vue';
import VoteButton from './VoteButton.vue';

defineProps({
    post: { type: Object, required: true },
    to: { type: String, required: true }
});
defineEmits(['auth-required']);
</script>

<template>
    <article
        class="flex items-start gap-3 rounded-cb border border-edge bg-surface-raised p-3"
    >
        <VoteButton
            :post-id="post.id"
            :vote-count="post.voteCount"
            :viewer-has-voted="post.viewerHasVoted === true"
            @auth-required="$emit('auth-required')"
        />
        <div class="min-w-0 flex-1">
            <RouterLink :to="to" class="font-medium hover:text-brand">
                {{ post.title }}
                <span v-if="post.pinned" title="Pinned" aria-hidden="true"
                    >📌</span
                >
            </RouterLink>
            <p v-if="post.body" class="mt-0.5 truncate text-sm text-muted">
                {{ post.body }}
            </p>
            <div class="mt-1.5 flex items-center gap-2 text-xs text-muted">
                <StatusPill :status="post.status" />
                <span v-if="post.commentCount > 0"
                    >💬 {{ post.commentCount }}</span
                >
                <span v-if="post.authorName">{{ post.authorName }}</span>
            </div>
        </div>
    </article>
</template>
