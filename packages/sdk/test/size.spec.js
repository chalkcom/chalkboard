import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const LIMIT_BYTES = 18 * 1024;

describe('bundle size', () => {
    it(`dist/sdk.iife.js is at most ${LIMIT_BYTES} bytes gzipped`, () => {
        // The `pretest` script runs `pnpm build`, so dist/ exists here. If
        // this throws ENOENT, run `pnpm build` in packages/sdk first.
        const bundle = readFileSync(
            join(import.meta.dirname, '..', 'dist', 'sdk.iife.js')
        );
        const gzipped = gzipSync(bundle, { level: 9 }).length;
        expect(gzipped).toBeLessThanOrEqual(LIMIT_BYTES);
    });
});
