/**
 * Pure input validators. Every validator returns `{ ok, errors }` and never
 * throws; `errors` is an array of human-readable strings, empty when ok.
 */

import { STATUSES } from '../protocol/index.js';

export const POST_TITLE_MAX = 200;
export const POST_BODY_MAX = 10000;
export const COMMENT_BODY_MAX = 5000;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOPIC_RE = /^[a-z0-9_-]{1,64}$/i;
const TAG_RE = /^.{1,40}$/;

/**
 * @param {string[]} errors
 * @returns {{ ok: boolean, errors: string[] }}
 */
function result(errors) {
    return { ok: errors.length === 0, errors };
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate a post payload ({ title, body? }).
 * @param {{ title?: unknown, body?: unknown }} [input]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePost(input) {
    const errors = [];
    const { title, body } = input ?? {};
    if (!isNonEmptyString(title)) {
        errors.push('title is required');
    } else if (title.length > POST_TITLE_MAX) {
        errors.push(`title must be at most ${POST_TITLE_MAX} characters`);
    }
    if (body !== undefined && body !== null) {
        if (typeof body !== 'string') {
            errors.push('body must be a string');
        } else if (body.length > POST_BODY_MAX) {
            errors.push(`body must be at most ${POST_BODY_MAX} characters`);
        }
    }
    return result(errors);
}

/**
 * Validate a comment payload ({ body }).
 * @param {{ body?: unknown }} [input]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateComment(input) {
    const errors = [];
    const { body } = input ?? {};
    if (!isNonEmptyString(body)) {
        errors.push('body is required');
    } else if (body.length > COMMENT_BODY_MAX) {
        errors.push(`body must be at most ${COMMENT_BODY_MAX} characters`);
    }
    return result(errors);
}

/**
 * Validate a post status value.
 * @param {unknown} status
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateStatus(status) {
    const errors = [];
    if (typeof status !== 'string' || !STATUSES.includes(status)) {
        errors.push(`status must be one of: ${STATUSES.join(', ')}`);
    }
    return result(errors);
}

/**
 * Validate a URL-safe slug (lowercase, digits, single dashes).
 * @param {unknown} slug
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSlug(slug) {
    const errors = [];
    if (typeof slug !== 'string' || slug.length === 0) {
        errors.push('slug is required');
    } else if (slug.length > 80) {
        errors.push('slug must be at most 80 characters');
    } else if (!SLUG_RE.test(slug)) {
        errors.push(
            'slug may only contain lowercase letters, digits and dashes'
        );
    }
    return result(errors);
}

/**
 * Validate a topic identifier (short machine name set by the host app).
 * @param {unknown} topic
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateTopic(topic) {
    const errors = [];
    if (typeof topic !== 'string' || !TOPIC_RE.test(topic)) {
        errors.push(
            'topic must be 1-64 characters of letters, digits, dashes or underscores'
        );
    }
    return result(errors);
}

/**
 * Validate a tag name.
 * @param {unknown} name
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateTag(name) {
    const errors = [];
    if (!isNonEmptyString(name) || !TAG_RE.test(name.trim())) {
        errors.push('tag name must be 1-40 characters');
    }
    return result(errors);
}
