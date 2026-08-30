import { describe, expect, it } from 'vitest';
import {
    COMMENT_BODY_MAX,
    POST_BODY_MAX,
    POST_TITLE_MAX,
    validateComment,
    validatePost,
    validateSlug,
    validateStatus,
    validateTag,
    validateTopic
} from '@chalkcom/core/validate';

describe('validatePost', () => {
    it('accepts a title-only post', () => {
        expect(validatePost({ title: 'Dark mode please' })).toEqual({
            ok: true,
            errors: []
        });
    });

    it('accepts a post with a body at the limit', () => {
        const res = validatePost({
            title: 'x',
            body: 'b'.repeat(POST_BODY_MAX)
        });
        expect(res.ok).toBe(true);
    });

    it('rejects a missing or blank title', () => {
        expect(validatePost({}).ok).toBe(false);
        expect(validatePost({ title: '   ' }).ok).toBe(false);
        expect(validatePost(undefined).ok).toBe(false);
        expect(validatePost({ title: 42 }).ok).toBe(false);
    });

    it('rejects an overlong title', () => {
        const res = validatePost({ title: 't'.repeat(POST_TITLE_MAX + 1) });
        expect(res.ok).toBe(false);
        expect(res.errors[0]).toMatch(/200/);
    });

    it('rejects an overlong or non-string body', () => {
        expect(
            validatePost({ title: 'x', body: 'b'.repeat(POST_BODY_MAX + 1) }).ok
        ).toBe(false);
        expect(validatePost({ title: 'x', body: ['nope'] }).ok).toBe(false);
    });

    it('collects multiple errors', () => {
        const res = validatePost({ title: '', body: 7 });
        expect(res.errors).toHaveLength(2);
    });
});

describe('validateComment', () => {
    it('accepts a body up to the limit', () => {
        expect(validateComment({ body: 'c'.repeat(COMMENT_BODY_MAX) }).ok).toBe(
            true
        );
    });

    it('rejects blank, missing and overlong bodies', () => {
        expect(validateComment({}).ok).toBe(false);
        expect(validateComment({ body: ' ' }).ok).toBe(false);
        expect(
            validateComment({ body: 'c'.repeat(COMMENT_BODY_MAX + 1) }).ok
        ).toBe(false);
    });
});

describe('validateStatus', () => {
    it.each([
        'open',
        'under_review',
        'planned',
        'in_progress',
        'complete',
        'closed'
    ])('accepts %s', status => {
        expect(validateStatus(status).ok).toBe(true);
    });

    it('rejects unknown values and non-strings', () => {
        expect(validateStatus('shipped').ok).toBe(false);
        expect(validateStatus(null).ok).toBe(false);
        expect(validateStatus(3).ok).toBe(false);
    });
});

describe('validateSlug', () => {
    it('accepts well-formed slugs', () => {
        expect(validateSlug('dark-mode').ok).toBe(true);
        expect(validateSlug('a').ok).toBe(true);
        expect(validateSlug('v2-api').ok).toBe(true);
    });

    it('rejects malformed slugs', () => {
        for (const bad of [
            '',
            'Dark-Mode',
            '-leading',
            'trailing-',
            'double--dash',
            'has space',
            's'.repeat(81),
            null
        ]) {
            expect(validateSlug(bad).ok).toBe(false);
        }
    });
});

describe('validateTopic', () => {
    it('accepts short machine names', () => {
        expect(validateTopic('billing').ok).toBe(true);
        expect(validateTopic('menu_editor').ok).toBe(true);
        expect(validateTopic('POS-integrations').ok).toBe(true);
    });

    it('rejects empty, overlong and spaced topics', () => {
        expect(validateTopic('').ok).toBe(false);
        expect(validateTopic('a'.repeat(65)).ok).toBe(false);
        expect(validateTopic('two words').ok).toBe(false);
        expect(validateTopic(undefined).ok).toBe(false);
    });
});

describe('validateTag', () => {
    it('accepts reasonable names', () => {
        expect(validateTag('Bug').ok).toBe(true);
        expect(validateTag('needs design').ok).toBe(true);
    });

    it('rejects blank and overlong names', () => {
        expect(validateTag('').ok).toBe(false);
        expect(validateTag('   ').ok).toBe(false);
        expect(validateTag('t'.repeat(41)).ok).toBe(false);
        expect(validateTag(9).ok).toBe(false);
    });
});
