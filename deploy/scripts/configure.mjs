/**
 * Create the per-install config files when they are missing, so `pnpm dev`
 * and `pnpm quickstart` work on a fresh clone:
 *
 *   wrangler.toml   copied from wrangler.toml.example (gitignored)
 *   .dev.vars       copied from .dev.vars.example (gitignored, local dev
 *                   secrets — wrangler never deploys this file)
 *
 * Existing files are never touched, so edits survive re-runs.
 */

import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const deployDir = dirname(fileURLToPath(new URL('.', import.meta.url)));

const copies = [
    ['wrangler.toml.example', 'wrangler.toml'],
    ['.dev.vars.example', '.dev.vars']
];

for (const [from, to] of copies) {
    if (existsSync(join(deployDir, to))) continue;
    copyFileSync(join(deployDir, from), join(deployDir, to));
    console.log(`Created deploy/${to} from ${from}`);
}

if (!existsSync(join(deployDir, 'dist'))) {
    console.log(
        'No deploy/dist yet — run `pnpm build` at the repo root first.'
    );
}
