<script setup>
import { ref } from 'vue';

const props = defineProps({
    questions: { type: Array, required: true },
    busy: { type: Boolean, default: false }
});
const emit = defineEmits(['improve', 'skip']);

const answers = ref(props.questions.map(() => ''));

function improve() {
    const answered = props.questions
        .map((q, i) => ({
            question: q.question,
            answer: answers.value[i].trim()
        }))
        .filter(a => a.answer.length > 0);
    emit('improve', answered);
}
</script>

<template>
    <section
        class="rounded-cb border border-edge bg-surface-raised p-4"
        aria-label="Follow-up questions"
    >
        <h2 class="text-sm font-semibold">Quick follow-up — all optional</h2>
        <p class="mt-1 text-xs text-muted">
            A couple of details would help the team act on this. Answer any, or
            post as is.
        </p>
        <div v-for="(q, i) in questions" :key="q.id" class="mt-3">
            <label class="block text-sm" :for="`assist-${q.id}`">
                {{ q.question }}
            </label>
            <textarea
                :id="`assist-${q.id}`"
                v-model="answers[i]"
                rows="2"
                maxlength="2000"
                class="mt-1 w-full rounded-cb border border-edge bg-surface px-3 py-2 text-sm"
                placeholder="Optional"
            ></textarea>
        </div>
        <div class="mt-4 flex gap-2">
            <button
                type="button"
                class="rounded-cb bg-brand px-3 py-1.5 text-sm font-medium text-brand-contrast"
                :disabled="busy"
                data-assist-improve
                @click="improve"
            >
                {{ busy ? 'Working…' : 'Improve my post' }}
            </button>
            <button
                type="button"
                class="rounded-cb border border-edge px-3 py-1.5 text-sm"
                :disabled="busy"
                data-assist-skip
                @click="$emit('skip')"
            >
                Post as is
            </button>
        </div>
    </section>
</template>
