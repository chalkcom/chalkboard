<script setup>
import { ref } from 'vue';
import { api, session } from '../api.js';

const props = defineProps({
    postId: { type: String, required: true },
    comments: { type: Array, required: true }
});
const emit = defineEmits(['changed', 'auth-required']);

const replyTo = ref(/** @type {string | null} */ (null));
const draft = ref('');
const busy = ref(false);

/** @param {string | null} parentId */
async function submit(parentId) {
    const body = draft.value.trim();
    if (!body || busy.value) return;
    if (!session.jwt && !session.user) {
        emit('auth-required');
        return;
    }
    busy.value = true;
    try {
        await api(`/api/v1/posts/${props.postId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ body, parentId: parentId ?? undefined })
        });
        draft.value = '';
        replyTo.value = null;
        emit('changed');
    } catch (error) {
        if (error.status === 401) emit('auth-required');
    } finally {
        busy.value = false;
    }
}

/** @param {string} id */
function toggleReply(id) {
    replyTo.value = replyTo.value === id ? null : id;
    draft.value = '';
}
</script>

<template>
    <section aria-label="Comments">
        <div v-for="comment in comments" :key="comment.id" class="mt-4">
            <div class="rounded-cb border border-edge bg-surface-raised p-3">
                <p v-if="comment.deleted" class="text-sm italic text-muted">
                    Comment deleted
                </p>
                <template v-else>
                    <p class="text-sm">{{ comment.body }}</p>
                    <p class="mt-1 text-xs text-muted">
                        <span class="font-medium">{{
                            comment.authorName || 'Anonymous'
                        }}</span>
                        <span
                            v-if="comment.isTeam"
                            class="ml-1 rounded bg-brand px-1 text-brand-contrast"
                            >Team</span
                        >
                        · {{ new Date(comment.createdAt).toLocaleDateString() }}
                        <button
                            type="button"
                            class="ml-2 underline"
                            @click="toggleReply(comment.id)"
                        >
                            Reply
                        </button>
                    </p>
                </template>
            </div>
            <div class="ml-6">
                <div
                    v-for="reply in comment.replies"
                    :key="reply.id"
                    class="mt-2 rounded-cb border border-edge bg-surface-raised p-3"
                >
                    <p v-if="reply.deleted" class="text-sm italic text-muted">
                        Comment deleted
                    </p>
                    <template v-else>
                        <p class="text-sm">{{ reply.body }}</p>
                        <p class="mt-1 text-xs text-muted">
                            <span class="font-medium">{{
                                reply.authorName || 'Anonymous'
                            }}</span>
                            <span
                                v-if="reply.isTeam"
                                class="ml-1 rounded bg-brand px-1 text-brand-contrast"
                                >Team</span
                            >
                        </p>
                    </template>
                </div>
                <form
                    v-if="replyTo === comment.id"
                    class="mt-2"
                    @submit.prevent="submit(comment.id)"
                >
                    <textarea
                        v-model="draft"
                        rows="2"
                        required
                        class="w-full rounded-cb border border-edge p-2 text-sm"
                        placeholder="Write a reply…"
                    ></textarea>
                    <button
                        type="submit"
                        class="mt-1 rounded-cb bg-brand px-3 py-1 text-sm text-brand-contrast"
                        :disabled="busy"
                    >
                        Reply
                    </button>
                </form>
            </div>
        </div>

        <form
            v-if="replyTo === null"
            class="mt-4"
            @submit.prevent="submit(null)"
        >
            <textarea
                v-model="draft"
                rows="3"
                required
                class="w-full rounded-cb border border-edge p-2 text-sm"
                placeholder="Leave a comment…"
            ></textarea>
            <button
                type="submit"
                class="mt-1 rounded-cb bg-brand px-3 py-1.5 text-sm text-brand-contrast"
                :disabled="busy"
            >
                Comment
            </button>
        </form>
    </section>
</template>
