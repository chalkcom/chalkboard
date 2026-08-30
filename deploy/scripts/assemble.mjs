/**
 * Assemble the deployable directory tree next to wrangler.toml:
 *
 *   deploy/dist/        board SPA build + sdk.js + _headers
 *   deploy/migrations/  copied from packages/worker/migrations
 *
 * Run after `pnpm -r build` (the root `pnpm build` does both).
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const deployDir = dirname(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = join(deployDir, '..');

const boardDist = join(repoRoot, 'packages', 'board', 'dist');
const sdkBundle = join(repoRoot, 'packages', 'sdk', 'dist', 'sdk.iife.js');
const workerMigrations = join(repoRoot, 'packages', 'worker', 'migrations');

for (const [name, path] of [
    ['board build (packages/board/dist)', boardDist],
    ['sdk build (packages/sdk/dist/sdk.iife.js)', sdkBundle],
    ['worker migrations', workerMigrations]
]) {
    if (!existsSync(path)) {
        console.error(`Missing ${name} — run \`pnpm -r build\` first.`);
        process.exit(1);
    }
}

const dist = join(deployDir, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(boardDist, dist, { recursive: true });
cpSync(sdkBundle, join(dist, 'sdk.js'));

const migrations = join(deployDir, 'migrations');
rmSync(migrations, { recursive: true, force: true });
cpSync(workerMigrations, migrations, { recursive: true });

// Cache policy: the SDK URL is stable (an hour is fine), Vite asset
// filenames are content-hashed (cache forever).
writeFileSync(
    join(dist, '_headers'),
    [
        '/sdk.js',
        '  Cache-Control: public, max-age=3600',
        '/assets/*',
        '  Cache-Control: public, max-age=31536000, immutable',
        ''
    ].join('\n')
);

console.log(`Assembled ${dist} and ${migrations}`);
