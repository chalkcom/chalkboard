<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { api, loadUser, session } from '../api.js';
import PostRow from '../components/PostRow.vue';

const filter = ref('new');
const queue = ref([]);
const metrics = ref(null);
const ready = ref(false);

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
        })
    ]);
});

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
