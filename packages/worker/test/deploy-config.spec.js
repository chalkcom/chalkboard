import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

/**
 * Config-lint over deploy/wrangler.toml.example (injected at config time —
 * workerd has no filesystem). There is no automated harness for
 * Cloudflare's assets-first behavior, so this pins the config that makes
 * it safe: a top-level browser navigation (Sec-Fetch-Mode: navigate) is
 * answered by the SPA fallback BEFORE the worker unless the path is in
 * run_worker_first — without it, GET /auth/sso returns index.html, no
 * session cookie is set, and the SSO JWT leaks into browser history.
 */
describe('deploy/wrangler.toml.example', () => {
    const toml = String(env.TEST_WRANGLER_EXAMPLE);

    it('routes /api/* and /auth/* worker-first', () => {
        const match = toml.match(/^run_worker_first\s*=\s*\[([^\]]*)\]/m);
        expect(match, 'run_worker_first missing from [assets]').toBeTruthy();
        const entries = match[1]
            .split(',')
            .map(entry => entry.trim().replace(/^["']|["']$/g, ''));
        expect(entries).toContain('/api/*');
        expect(entries).toContain('/auth/*');
    });

    it('keeps the SPA fallback for board routes', () => {
        expect(toml).toMatch(
            /not_found_handling\s*=\s*"single-page-application"/
        );
    });
});
