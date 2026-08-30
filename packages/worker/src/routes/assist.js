/**
 * AI interviewer routes. One round of at most three follow-up questions,
 * then a user-reviewed synthesis. The interview fails OPEN (empty question
 * list) so submitting is never blocked; synthesis failures return 502 and
 * the UI falls back to posting the original draft.
 */

import { validatePost, validateTopic } from '@chalkcom/core/validate';
import { json, errorResponse, readJson } from '../lib/http.js';
import { toFtsQuery } from '../lib/db.js';
import { readConfigRows } from './config.js';
import {
    QUESTIONS_SCHEMA,
    SYNTHESIS_SCHEMA,
    assistEnabled,
    callAssist,
    resolveAssistModel
} from '../lib/assist.js';

const MAX_QUESTIONS = 3;
const MAX_ANSWER_LENGTH = 2000;
const MAX_QUESTION_LENGTH = 300;

/**
 * @param {import('../lib/router.js').RouteContext} c
 * @returns {Response | null} 503 when the feature is off
 */
function checkEnabled(c) {
    if (assistEnabled(c.env)) return null;
    return errorResponse('assist disabled', 503);
}

/**
 * Validate the shared draft fields of an assist request.
 * @param {any} body
 * @returns {Response | null}
 */
function checkDraft(body) {
    const valid = validatePost(body);
    if (!valid.ok) return errorResponse('invalid draft', 400, valid);
    if (body.topic && !validateTopic(body.topic).ok) {
        return errorResponse('invalid topic', 400);
    }
    if (body.locale !== undefined && typeof body.locale !== 'string') {
        return errorResponse('invalid locale', 400);
    }
    return null;
}

/**
 * Titles of up to five FTS-similar live posts, as context for the model
 * and duplicate hints for the UI.
 * @param {import('../lib/router.js').RouteContext} c
 * @param {string} title
 * @returns {Promise<Array<{ id: string, slug: string, title: string }>>}
 */
async function similarTitles(c, title) {
    const match = toFtsQuery(title);
    if (!match) return [];
    const { results } = await c.env.DB.prepare(
        `SELECT p.id, p.slug, p.title
         FROM posts_fts f JOIN posts p ON p.id = f.post_id
         WHERE posts_fts MATCH ?
           AND p.deleted_at IS NULL AND p.merged_into_id IS NULL
         ORDER BY bm25(posts_fts) LIMIT 5`
    )
        .bind(match)
        .all();
    return results.map(row => ({
        id: String(row.id),
        slug: String(row.slug),
        title: String(row.title)
    }));
}

/**
 * @param {import('../lib/router.js').RouteContext} c
 * @param {any} body
 * @param {Array<{ title: string }>} similar
 */
async function resolveCall(c, body, similar, schema, mode) {
    const model = resolveAssistModel(
        c.env,
        c.options,
        await readConfigRows(c.env.DB)
    );
    const transport =
        /** @type {any} */ (c.options)?.assist?.transport ?? fetch;
    const result = await callAssist({
        env: c.env,
        model,
        schema,
        transport,
        payload: {
            mode,
            draft: {
                title: String(body.title),
                body: typeof body.body === 'string' ? body.body : ''
            },
            topic: body.topic ?? null,
            locale: typeof body.locale === 'string' ? body.locale : null,
            similarPostTitles: similar.map(post => post.title),
            ...(mode === 'synthesize' ? { answers: body.answers } : {})
        }
    });
    return { result, model };
}

/**
 * POST /api/v1/assist/interview — up to three follow-up questions, or an
 * empty list on any failure so the submit flow proceeds unassisted.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function assistInterview(c) {
    const disabled = checkEnabled(c);
    if (disabled) return disabled;
    const body = /** @type {any} */ (await readJson(c.request)) ?? {};
    const invalid = checkDraft(body);
    if (invalid) return invalid;

    const similar = await similarTitles(c, String(body.title));
    const { result, model } = await resolveCall(
        c,
        body,
        similar,
        QUESTIONS_SCHEMA,
        'interview'
    );
    return json({ questions: sanitizeQuestions(result), model });
}

/**
 * Coerce whatever came back from the model into 0–3 well-formed questions.
 * @param {unknown} result
 * @returns {Array<{ id: string, question: string }>}
 */
function sanitizeQuestions(result) {
    const raw = /** @type {any} */ (result)?.questions;
    if (!Array.isArray(raw)) return [];
    const questions = [];
    for (const item of raw) {
        const question =
            typeof item?.question === 'string' ? item.question.trim() : '';
        if (!question || question.length > MAX_QUESTION_LENGTH) continue;
        questions.push({ id: `q${questions.length + 1}`, question });
        if (questions.length === MAX_QUESTIONS) break;
    }
    return questions;
}

/**
 * @param {any} answers
 * @returns {Array<{ question: string, answer: string }> | null} null when
 *   malformed
 */
function sanitizeAnswers(answers) {
    if (!Array.isArray(answers) || answers.length > MAX_QUESTIONS) {
        return null;
    }
    const clean = [];
    for (const item of answers) {
        if (
            typeof item?.question !== 'string' ||
            typeof item?.answer !== 'string' ||
            item.question.length > MAX_QUESTION_LENGTH ||
            item.answer.length > MAX_ANSWER_LENGTH
        ) {
            return null;
        }
        clean.push({ question: item.question, answer: item.answer });
    }
    return clean;
}

/**
 * POST /api/v1/assist/synthesize — turn the draft + answers into a
 * proposed post the user reviews and edits. 502 on any model failure.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function assistSynthesize(c) {
    const disabled = checkEnabled(c);
    if (disabled) return disabled;
    const body = /** @type {any} */ (await readJson(c.request)) ?? {};
    const invalid = checkDraft(body);
    if (invalid) return invalid;
    const answers = sanitizeAnswers(body.answers ?? []);
    if (!answers) return errorResponse('invalid answers', 400);

    const similar = await similarTitles(c, String(body.title));
    const { result, model } = await resolveCall(
        c,
        { ...body, answers },
        similar,
        SYNTHESIS_SCHEMA,
        'synthesize'
    );
    const synthesis = /** @type {any} */ (result);
    if (
        !synthesis ||
        typeof synthesis.title !== 'string' ||
        typeof synthesis.body !== 'string' ||
        !validatePost({ title: synthesis.title, body: synthesis.body }).ok
    ) {
        return errorResponse('synthesis failed', 502);
    }
    const suggestedTopic =
        typeof synthesis.suggestedTopic === 'string' &&
        validateTopic(synthesis.suggestedTopic).ok
            ? synthesis.suggestedTopic
            : undefined;
    return json({
        synthesis: {
            title: synthesis.title.trim(),
            body: synthesis.body,
            ...(suggestedTopic ? { suggestedTopic } : {})
        },
        duplicates: similar.slice(0, 3),
        model
    });
}
