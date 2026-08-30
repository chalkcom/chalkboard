<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { EVENT_NAMES } from '@chalkcom/core/protocol';
import { api } from '../api.js';
import { useConfig } from '../composables/useConfig.js';
import { embedState, toEmbedPath } from '../embed/embed.js';
import { trackEvent } from '../track.js';
import StatusPill from '../components/StatusPill.vue';
import AssistInterview from '../components/AssistInterview.vue';

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

// AI interviewer flow. 'draft' → (questions came back) 'interview' →
// (user answered + synthesis) 'review' → post. Every failure path falls
// back to posting the plain draft; assist can never block submitting.
const stage = ref('draft');
const questions = ref([]);
const assistBusy = ref(false);
/** @type {import('vue').Ref<null | { summary: string, url: string | null }>} */
const existingFeature = ref(null);
/** @type {import('vue').Ref<Array<{ id: string, slug: string, title: string, status: string }>>} */
const duplicates = ref([]);
/** @type {import('vue').Ref<null | { originalTitle: string, originalBody: string, questions: object[], answers: object[], model: string | null }>} */
const interviewPayload = ref(null);

const assistEnabled = computed(() => config.assist?.enabled === true);

watch(title, value => {
    clearTimeout(similarTimer);
    if (stage.value !== 'draft' || value.trim().length < 3) {
        similar.value = [];
        return;
    }
    similarTimer = setTimeout(async () => {
        try {
            const res = await api(
                `/api/v1/similar?title=${encodeURIComponent(value.trim())}`
            );
            similar.value = res.posts;
            if (res.posts.length > 0) {
                trackEvent(EVENT_NAMES.SIMILAR_SHOWN, {});
            }
        } catch {
            similar.value = [];
        }
    }, 300);
});

/** @param {{ slug: string }} post */
function openSimilar(post) {
    trackEvent(EVENT_NAMES.SIMILAR_CLICKED, {});
    const target = `/p/${post.slug}`;
    router.push(embedState.active ? toEmbedPath(target) : target);
}

/** Post the current title/body (+ interview payload when present). */
async function postNow() {
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
                source: embedState.active ? 'embed' : 'board',
                interview: interviewPayload.value ?? undefined
            })
        });
        if (interviewPayload.value) {
            trackEvent(EVENT_NAMES.ASSIST_APPLIED, { postId: res.post.id });
        }
        trackEvent(EVENT_NAMES.POST_SUBMIT, { postId: res.post.id });
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

/** Draft-stage submit: try the interview first when assist is on. */
async function submitDraft() {
    if (submitting.value || assistBusy.value) return;
    // In review, the visible fields already hold the (edited) synthesis.
    if (!assistEnabled.value || stage.value === 'review') {
        await postNow();
        return;
    }
    assistBusy.value = true;
    try {
        const res = await api('/api/v1/assist/interview', {
            method: 'POST',
            body: JSON.stringify({
                title: title.value.trim(),
                body: body.value,
                topic: topic.value || undefined,
                locale: navigator.language || undefined
            })
        });
        if (enterInterviewStage(res)) return;
    } catch {
        // Assist is best-effort; fall through to a plain post.
    } finally {
        assistBusy.value = false;
    }
    interviewPayload.value = null;
    await postNow();
}

/**
 * Move to the interview stage when the response has anything to show.
 * @param {any} res interview response
 * @returns {boolean} whether the stage changed
 */
function enterInterviewStage(res) {
    const gotQuestions =
        Array.isArray(res.questions) && res.questions.length > 0;
    const gotDeflection = Boolean(res.existingFeature?.summary);
    if (!gotQuestions && !gotDeflection) return false;
    questions.value = gotQuestions ? res.questions : [];
    existingFeature.value = gotDeflection ? res.existingFeature : null;
    interviewPayload.value = gotQuestions
        ? {
              originalTitle: title.value.trim(),
              originalBody: body.value,
              questions: res.questions,
              answers: [],
              model: res.model ?? null
          }
        : null;
    stage.value = 'interview';
    trackEvent(EVENT_NAMES.ASSIST_OFFERED, {});
    return true;
}

/** "Post as is" from the question card. */
async function skipAssist() {
    trackEvent(EVENT_NAMES.ASSIST_SKIPPED, {});
    interviewPayload.value = null;
    await postNow();
}

/** "That solves it" on the existing-feature card: no post is created. */
function deflect() {
    trackEvent(EVENT_NAMES.ASSIST_DEFLECTED, {});
    router.push(embedState.active ? toEmbedPath('/') : '/');
}

/** "Not quite — continue": dismiss the card, proceed normally. */
async function dismissDeflection() {
    existingFeature.value = null;
    if (questions.value.length === 0) {
        // Nothing left to ask — the draft goes up as written.
        interviewPayload.value = null;
        await postNow();
    }
}

/**
 * "Improve my post": synthesize from the answers, then let the user edit
 * the AI draft before posting.
 * @param {Array<{ question: string, answer: string }>} answers
 */
async function improveWithAnswers(answers) {
    if (assistBusy.value) return;
    trackEvent(EVENT_NAMES.ASSIST_ANSWERED, { answered: answers.length });
    assistBusy.value = true;
    try {
        const payload = interviewPayload.value;
        const res = await api('/api/v1/assist/synthesize', {
            method: 'POST',
            body: JSON.stringify({
                title: payload.originalTitle,
                body: payload.originalBody,
                topic: topic.value || undefined,
                locale: navigator.language || undefined,
                answers
            })
        });
        payload.answers = answers;
        title.value = res.synthesis.title;
        body.value = res.synthesis.body;
        if (res.synthesis.suggestedTopic && !topic.value) {
            topic.value = res.synthesis.suggestedTopic;
        }
        duplicates.value = Array.isArray(res.duplicates) ? res.duplicates : [];
        stage.value = 'review';
    } catch {
        // Synthesis failed — post the original draft with the transcript.
        if (interviewPayload.value) interviewPayload.value.answers = answers;
        await postNow();
    } finally {
        assistBusy.value = false;
    }
}
</script>

<template>
    <form class="max-w-xl" @submit.prevent="submitDraft">
        <h1 class="text-xl font-semibold">Make a suggestion</h1>

        <p
            v-if="stage === 'review'"
            class="mt-3 rounded-cb border border-edge bg-surface-raised p-3 text-xs text-muted"
            data-assist-review-note
        >
            This is an AI draft built from your answers — edit anything before
            posting. Your original wording is kept for the team.
        </p>

        <div
            v-if="stage === 'review' && duplicates.length > 0"
            class="mt-2 rounded-cb border border-edge bg-surface-raised p-3"
            data-assist-duplicates
        >
            <p class="text-xs font-medium text-muted">
                Possibly the same idea — vote instead?
            </p>
            <ul class="mt-1 space-y-1">
                <li v-for="d in duplicates" :key="d.id">
                    <button
                        type="button"
                        class="flex w-full items-center gap-2 text-left text-sm hover:text-brand"
                        @click="openSimilar(d)"
                    >
                        <span class="truncate">{{ d.title }}</span>
                        <StatusPill :status="d.status" />
                    </button>
                </li>
            </ul>
        </div>

        <template v-if="stage !== 'interview'">
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
                v-if="stage === 'draft' && similar.length > 0"
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
                    <option
                        v-for="t in config.topics"
                        :key="t.id"
                        :value="t.id"
                    >
                        {{ t.label }}
                    </option>
                </select>
            </template>
        </template>

        <div v-else class="mt-4">
            <p class="text-sm text-muted">
                <span class="font-medium text-ink">{{ title }}</span>
            </p>
            <section
                v-if="existingFeature"
                class="mt-3 rounded-cb border-2 border-brand bg-surface-raised p-4"
                data-assist-deflection
                aria-label="This might already exist"
            >
                <h2 class="text-sm font-semibold">
                    💡 This might already exist
                </h2>
                <p class="mt-1 text-sm">{{ existingFeature.summary }}</p>
                <a
                    v-if="existingFeature.url"
                    :href="existingFeature.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-1 inline-block text-sm text-brand underline"
                >
                    Read the docs
                </a>
                <div class="mt-3 flex gap-2">
                    <button
                        type="button"
                        class="rounded-cb bg-brand px-3 py-1.5 text-sm font-medium text-brand-contrast"
                        data-assist-deflect
                        @click="deflect"
                    >
                        That solves it
                    </button>
                    <button
                        type="button"
                        class="rounded-cb border border-edge px-3 py-1.5 text-sm"
                        data-assist-continue
                        @click="dismissDeflection"
                    >
                        Not quite — continue
                    </button>
                </div>
            </section>
            <AssistInterview
                v-if="!existingFeature && questions.length > 0"
                class="mt-3"
                :questions="questions"
                :busy="assistBusy || submitting"
                @improve="improveWithAnswers"
                @skip="skipAssist"
            />
        </div>

        <p v-if="errorMessage" class="mt-3 text-sm text-red-600">
            {{ errorMessage }}
        </p>
        <button
            v-if="stage !== 'interview'"
            type="submit"
            class="mt-4 rounded-cb bg-brand px-4 py-2 text-sm font-medium text-brand-contrast"
            :disabled="submitting || assistBusy"
            data-submit
        >
            {{
                submitting || assistBusy
                    ? 'Submitting…'
                    : stage === 'review'
                      ? 'Post suggestion'
                      : 'Submit suggestion'
            }}
        </button>
    </form>
</template>
