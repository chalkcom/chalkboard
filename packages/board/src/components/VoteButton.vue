<script setup>
import { ref, watch } from 'vue';
import { api, session } from '../api.js';

const props = defineProps({
    postId: { type: String, required: true },
    voteCount: { type: Number, required: true },
    viewerHasVoted: { type: Boolean, default: false }
});
const emit = defineEmits(['voted', 'auth-required']);

const count = ref(props.voteCount);
const voted = ref(props.viewerHasVoted);
const busy = ref(false);

watch(
    () => [props.voteCount, props.viewerHasVoted],
    ([newCount, newVoted]) => {
        count.value = newCount;
        voted.value = newVoted;
    }
);

async function toggle() {
    if (busy.value) return;
    if (!session.jwt && !session.user) {
        emit('auth-required');
        return;
    }
    // Optimistic flip; reconciled (or rolled back) by the response.
    const wasVoted = voted.value;
    const wasCount = count.value;
    voted.value = !wasVoted;
    count.value = wasCount + (wasVoted ? -1 : 1);
    busy.value = true;
    try {
        const res = await api(`/api/v1/posts/${props.postId}/vote`, {
            method: wasVoted ? 'DELETE' : 'POST'
        });
        count.value = res.voteCount;
        voted.value = res.viewerHasVoted;
        emit('voted', res);
    } catch (error) {
        voted.value = wasVoted;
        count.value = wasCount;
        if (error.status === 401) emit('auth-required');
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <button
        type="button"
        class="flex w-12 flex-col items-center rounded-cb border px-2 py-1.5 text-sm transition-colors"
        :class="
            voted
                ? 'border-brand bg-brand text-brand-contrast'
                : 'border-edge bg-surface-raised text-ink hover:border-brand'
        "
        :aria-pressed="voted"
        @click="toggle"
    >
        <span aria-hidden="true" class="text-xs leading-none">▲</span>
        <span class="font-semibold">{{ count }}</span>
    </button>
</template>
