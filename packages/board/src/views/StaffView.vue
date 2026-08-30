<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { api, loadUser, session } from '../api.js';
import PostRow from '../components/PostRow.vue';

const filter = ref('new');
const queue = ref([]);
const metrics = ref(null);
const ready = ref(false);

// Interviewer briefing (assist.context config row).
const briefing = ref('');
const briefingSource = ref('none');
const briefingSaving = ref(false);
const briefingStatus = ref('');
const BRIEFING_CAP = 16000;

const isStaff = computed(() => session.user?.isStaff === true);

const FILTERS = [
    { id: 'new', label: 'New' },
    { id: 'untagged', label: 'Untagged' },
    { id: 'unanswered', label: 'Unanswered' }
];

async function loadQueue() {
    const res = await api(`/api/v1/staff/queue?filter=${filter.value}`);
    queue.value = res.posts;
}

onMounted(async () => {
    await loadUser();
    ready.value = true;
    if (!isStaff.value) return;
    await Promise.all([
        loadQueue(),
        api('/api/v1/staff/metrics').then(res => {
            metrics.value = res;
        }),
        api('/api/v1/staff/assist')
            .then(res => {
                briefing.value = res.context;
                briefingSource.value = res.source;
            })
            .catch(() => {})
    ]);
});

async function saveBriefing() {
    if (briefingSaving.value) return;
    briefingSaving.value = true;
    briefingStatus.value = '';
    try {
        await api('/api/v1/config', {
            method: 'PUT',
            body: JSON.stringify({ 'assist.context': briefing.value })
        });
        briefingStatus.value = 'Saved.';
        if (briefingSource.value === 'none' && briefing.value.trim()) {
            briefingSource.value = 'config';
        }
    } catch {
        briefingStatus.value = 'Could not save — check the length and retry.';
    } finally {
        briefingSaving.value = false;
    }
}

watch(filter, loadQueue);
</script>

<template>
    <div v-if="ready">
        <p v-if="!isStaff" class="text-sm text-muted">
            This area is for the team. Sign in with a staff account.
        </p>
        <template v-else>
            <h1 class="text-xl font-semibold">Triage</h1>
            <nav class="mt-3 flex gap-1" aria-label="Queue filter">
                <button
                    v-for="option in FILTERS"
                    :key="option.id"
                    type="button"
                    class="rounded-cb px-3 py-1.5 text-sm"
                    :class="
                        filter === option.id
                            ? 'bg-brand text-brand-contrast'
                            : 'text-muted hover:bg-surface-raised'
                    "
                    @click="filter = option.id"
                >
                    {{ option.label }}
                </button>
            </nav>
            <div class="mt-3 space-y-2">
                <PostRow
                    v-for="post in queue"
                    :key="post.id"
                    :post="post"
                    :to="`/p/${post.slug}`"
                />
                <p v-if="queue.length === 0" class="text-sm text-muted">
                    Queue is clear. 🎉
                </p>
            </div>

            <section
                class="mt-8 rounded-cb border border-edge bg-surface-raised p-4"
                aria-label="Interviewer"
            >
                <h2 class="text-lg font-semibold">Interviewer</h2>
                <p class="mt-1 text-sm text-muted">
                    Product briefing for the AI interviewer: terminology, what
                    the product does, what already exists. Used as reference
                    data on every interview and synthesis.
                </p>
                <p
                    v-if="briefingSource === 'option'"
                    class="mt-2 text-xs text-amber-700"
                    data-briefing-override-note
                >
                    A code-level option (createFeedbackApp assist.context) is
                    currently overriding this saved value.
                </p>
                <textarea
                    v-model="briefing"
                    rows="8"
                    :maxlength="BRIEFING_CAP"
                    class="mt-3 w-full rounded-cb border border-edge bg-surface px-3 py-2 font-mono text-xs"
                    placeholder="e.g. StoreKit is a hospitality ordering platform. 'Menu' means…"
                    data-briefing-input
                ></textarea>
                <div class="mt-1 flex items-center gap-3">
                    <button
                        type="button"
                        class="rounded-cb bg-brand px-3 py-1.5 text-sm font-medium text-brand-contrast"
                        :disabled="briefingSaving"
                        data-briefing-save
                        @click="saveBriefing"
                    >
                        {{ briefingSaving ? 'Saving…' : 'Save briefing' }}
                    </button>
                    <span class="text-xs text-muted">
                        {{ briefing.length }} / {{ BRIEFING_CAP }}
                    </span>
                    <span v-if="briefingStatus" class="text-xs text-muted">
                        {{ briefingStatus }}
                    </span>
                </div>
            </section>

            <template v-if="metrics">
                <h2 class="mt-8 text-lg font-semibold">Metrics</h2>
                <div class="mt-3 grid gap-4 md:grid-cols-2">
                    <section
                        class="rounded-cb border border-edge bg-surface-raised p-4"
                    >
                        <h3 class="text-sm font-semibold text-muted">
                            Monthly activity
                        </h3>
                        <table class="mt-2 w-full text-sm">
                            <thead>
                                <tr class="text-left text-xs text-muted">
                                    <th class="py-1">Month</th>
                                    <th>Posts</th>
                                    <th>Votes</th>
                                    <th>Participants</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="row in metrics.monthly.posts"
                                    :key="row.month"
                                >
                                    <td class="py-1">{{ row.month }}</td>
                                    <td>{{ row.count }}</td>
                                    <td>
                                        {{
                                            metrics.monthly.votes.find(
                                                v => v.month === row.month
                                            )?.count ?? 0
                                        }}
                                    </td>
                                    <td>
                                        {{
                                            metrics.monthly.participants.find(
                                                p => p.month === row.month
                                            )?.count ?? 0
                                        }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </section>
                    <section
                        class="rounded-cb border border-edge bg-surface-raised p-4"
                    >
                        <h3 class="text-sm font-semibold text-muted">
                            Event funnel
                        </h3>
                        <ul class="mt-2 space-y-1 text-sm">
                            <li
                                v-for="(count, type) in metrics.funnel"
                                :key="type"
                                class="flex justify-between"
                            >
                                <span>{{ type }}</span>
                                <span class="font-medium">{{ count }}</span>
                            </li>
                        </ul>
                    </section>
                </div>
            </template>
        </template>
    </div>
</template>
