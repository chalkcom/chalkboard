import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

// Migration SQL is read here (Node context) and handed to the worker tests
// as a binding; workerd has no filesystem access.
const migrationsDir = join(import.meta.dirname, 'migrations');
const migrations = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort()
    .map(file => ({
        name: file,
        sql: readFileSync(join(migrationsDir, file), 'utf8')
    }));

// The example deploy config is asserted against in test/deploy-config
// (run_worker_first is required for SSO to work in real browsers).
const wranglerExample = readFileSync(
    join(import.meta.dirname, '..', '..', 'deploy', 'wrangler.toml.example'),
    'utf8'
);

export default defineWorkersConfig({
    test: {
        include: ['test/**/*.spec.js'],
        poolOptions: {
            workers: {
                isolatedStorage: true,
                miniflare: {
                    compatibilityDate: '2026-08-01',
                    d1Databases: ['DB'],
                    kvNamespaces: ['RATE'],
                    bindings: {
                        TEST_MIGRATIONS: migrations,
                        TEST_WRANGLER_EXAMPLE: wranglerExample,
                        PUBLIC_URL: 'https://feedback.example.com',
                        ALLOWED_ORIGINS:
                            'https://app.example.com,https://*.preview.example.com',
                        ALLOW_ANONYMOUS_POSTS: 'false',
                        FEEDBACK_JWT_SECRET: 'test-jwt-secret',
                        IMPORT_TOKEN: 'test-import-token'
                    }
                }
            }
        }
    }
});
