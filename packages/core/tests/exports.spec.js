import { describe, expect, it } from 'vitest';

/**
 * The public export surface of every entry point, pinned. Adding or removing
 * a named export is an API change and must be made deliberately here too.
 */
const SURFACE = {
    '@chalkcom/core/validate': [
        'COMMENT_BODY_MAX',
        'POST_BODY_MAX',
        'POST_TITLE_MAX',
        'validateComment',
        'validatePost',
        'validateSlug',
        'validateStatus',
        'validateTag',
        'validateTopic'
    ],
    '@chalkcom/core/slug': ['newId', 'slugify', 'uniqueSlug'],
    '@chalkcom/core/jwt': [
        'base64urlDecode',
        'base64urlEncode',
        'signJwt',
        'signSession',
        'verifyJwt',
        'verifySession'
    ],
    '@chalkcom/core/markdown': ['escapeHtml', 'renderMarkdown'],
    '@chalkcom/core/protocol': [
        'DOM_EVENTS',
        'EVENT_NAMES',
        'MESSAGE_NAMESPACE',
        'MESSAGE_TYPES',
        'PROTOCOL_VERSION',
        'STATUSES'
    ]
};

describe('export surface', () => {
    it.each(Object.entries(SURFACE))(
        '%s exports exactly the pinned names',
        async (specifier, expected) => {
            const mod = await import(specifier);
            expect(Object.keys(mod).sort()).toEqual([...expected].sort());
        }
    );
});
