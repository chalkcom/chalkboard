import { describe, expect, it } from 'vitest';

/** The public export surface of every worker entry point, pinned. */
const SURFACE = {
    '@chalkcom/worker/app': ['createFeedbackApp']
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
