<script setup>
import { computed } from 'vue';

const props = defineProps({
    status: { type: String, required: true }
});

const LABELS = {
    open: 'Open',
    under_review: 'Under review',
    planned: 'Planned',
    in_progress: 'In progress',
    complete: 'Complete',
    closed: 'Closed'
};

const CLASSES = {
    open: 'bg-slate-100 text-slate-700',
    under_review: 'bg-amber-100 text-amber-800',
    planned: 'bg-sky-100 text-sky-800',
    in_progress: 'bg-indigo-100 text-indigo-800',
    complete: 'bg-emerald-100 text-emerald-800',
    closed: 'bg-slate-200 text-slate-600'
};

const label = computed(() => LABELS[props.status] ?? props.status);
const klass = computed(() => CLASSES[props.status] ?? CLASSES.open);
</script>

<template>
    <span
        class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
        :class="klass"
    >
        {{ label }}
    </span>
</template>
