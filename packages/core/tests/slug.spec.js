import { describe, expect, it } from 'vitest';
import { newId, slugify, uniqueSlug } from '@chalkcom/core/slug';

describe('slugify', () => {
    it('lowercases and dashes', () => {
        expect(slugify('Dark Mode Please')).toBe('dark-mode-please');
    });

    it('folds accents to ascii', () => {
        expect(slugify('Café à côté')).toBe('cafe-a-cote');
    });

    it('collapses punctuation runs and trims dashes', () => {
        expect(slugify('  Hello!!!  World?? ')).toBe('hello-world');
        expect(slugify('--already--dashed--')).toBe('already-dashed');
    });

    it('caps at 80 characters without a trailing dash', () => {
        const slug = slugify('word '.repeat(40));
        expect(slug.length).toBeLessThanOrEqual(80);
        expect(slug.endsWith('-')).toBe(false);
    });

    it('returns empty string for non-strings and symbol-only input', () => {
        expect(slugify(undefined)).toBe('');
        expect(slugify('!!!')).toBe('');
    });
});

describe('uniqueSlug', () => {
    it('returns the base when free', async () => {
        expect(await uniqueSlug('dark-mode', async () => false)).toBe(
            'dark-mode'
        );
    });

    it('appends a counter until free', async () => {
        const taken = new Set(['dark-mode', 'dark-mode-2', 'dark-mode-3']);
        expect(await uniqueSlug('dark-mode', async s => taken.has(s))).toBe(
            'dark-mode-4'
        );
    });

    it('keeps suffixed candidates within 80 characters', async () => {
        const base = 'x'.repeat(80);
        const slug = await uniqueSlug(base, async s => s === base);
        expect(slug.length).toBeLessThanOrEqual(80);
        expect(slug.endsWith('-2')).toBe(true);
    });

    it('falls back to "post" for an empty base', async () => {
        expect(await uniqueSlug('', async () => false)).toBe('post');
    });
});

describe('newId', () => {
    it('produces 16 lowercase hex characters', () => {
        const id = newId();
        expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('is unique across calls', () => {
        const ids = new Set(Array.from({ length: 100 }, newId));
        expect(ids.size).toBe(100);
    });
});
