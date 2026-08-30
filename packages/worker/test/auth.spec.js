import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { signJwt } from '@chalkcom/core/jwt';
import {
    applyMigrations,
    createPostAs,
    makeApp,
    memberJwt,
    staffJwt
} from './helpers.js';

beforeAll(async () => {
    await applyMigrations();
});

describe('JWT auth', () => {
    it('rejects a token signed with the wrong secret', async () => {
        const { call } = makeApp();
        const forged = await signJwt(
            { sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 },
            'wrong-secret'
        );
        const res = await call('/api/v1/users/me', { jwt: forged });
        expect(res.status).toBe(401);
    });

    it('rejects garbage bearer tokens', async () => {
        const { call } = makeApp();
        const res = await call('/api/v1/users/me', { jwt: 'not.a.jwt' });
        expect(res.status).toBe(401);
    });

    it('identifies a valid JWT holder and upserts the user', async () => {
        const { call } = makeApp();
        const res = await call('/api/v1/users/me', {
            jwt: await memberJwt({
                sub: 'merchant-42',
                email: 'owner@cafe.example',
                name: 'Cafe Owner',
                accountId: 'acct-9',
                accountName: 'Corner Cafe'
            })
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.user.email).toBe('owner@cafe.example');
        expect(body.user.accountName).toBe('Corner Cafe');
        expect(body.user.isStaff).toBe(false);
    });

    it('honours the staff role claim', async () => {
        const { call } = makeApp();
        const me = await (
            await call('/api/v1/users/me', { jwt: await staffJwt() })
        ).json();
        expect(me.user.isStaff).toBe(true);

        const queue = await call('/api/v1/staff/queue', {
            jwt: await staffJwt()
        });
        expect(queue.status).toBe(200);
        const denied = await call('/api/v1/staff/queue', {
            jwt: await memberJwt()
        });
        expect(denied.status).toBe(403);
        const anonymous = await call('/api/v1/staff/queue');
        expect(anonymous.status).toBe(401);
    });

    it('claims an imported placeholder user by email on first write', async () => {
        const { call } = makeApp();
        // Simulate an imported voter: user row without external_id.
        await env.DB.prepare(
            `INSERT INTO users (id, email, name, source, created_at)
             VALUES ('placeholder1', 'legacy@example.com', 'Legacy',
                     'import', '2025-01-01T00:00:00.000Z')`
        ).run();
        const post = await createPostAs(
            call,
            await memberJwt({
                sub: 'sso-legacy',
                email: 'legacy@example.com'
            }),
            { title: 'Claimed identity' }
        );
        // The write is attributed to the placeholder row, now claimed.
        expect(post.authorId).toBe('placeholder1');
        const claimed = await env.DB.prepare(
            "SELECT external_id FROM users WHERE id = 'placeholder1'"
        ).first();
        expect(claimed.external_id).toBe('sso-legacy');
    });
});

describe('SSO cookie flow', () => {
    it('sets a session cookie and redirects same-origin only', async () => {
        const { call } = makeApp();
        const token = await memberJwt({ sub: 'sso-1', email: 's@x.com' });
        const res = await call(
            `/auth/sso?jwt=${encodeURIComponent(token)}` +
                `&return_to=${encodeURIComponent(
                    'https://feedback.example.com/p/some-post'
                )}`
        );
        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('/p/some-post');
        const cookie = res.headers.get('Set-Cookie');
        expect(cookie).toContain('cb_session=');
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');

        // The cookie authenticates follow-up requests.
        const sessionValue = cookie.split(';')[0].split('=').slice(1).join('=');
        const me = await call('/api/v1/users/me', {
            headers: { Cookie: `cb_session=${sessionValue}` }
        });
        expect(me.status).toBe(200);
        expect((await me.json()).user.email).toBe('s@x.com');
    });

    it('falls back to / for cross-origin return_to', async () => {
        const { call } = makeApp();
        const token = await memberJwt({ sub: 'sso-2', email: 's2@x.com' });
        const res = await call(
            `/auth/sso?jwt=${encodeURIComponent(token)}` +
                `&return_to=${encodeURIComponent('https://evil.example.com/')}`
        );
        expect(res.headers.get('Location')).toBe('/');
    });

    it('rejects an invalid SSO jwt', async () => {
        const { call } = makeApp();
        const res = await call('/auth/sso?jwt=garbage');
        expect(res.status).toBe(401);
    });

    it('serves the Featurebase-shaped alias', async () => {
        const { call } = makeApp();
        const token = await memberJwt({ sub: 'sso-3', email: 's3@x.com' });
        const res = await call(
            `/api/v1/auth/access/jwt?jwt=${encodeURIComponent(token)}`
        );
        expect(res.status).toBe(302);
        expect(res.headers.get('Set-Cookie')).toContain('cb_session=');
    });

    it('requires an allowed Origin for cookie-authed mutations', async () => {
        const { call } = makeApp();
        const token = await memberJwt({ sub: 'sso-4', email: 's4@x.com' });
        const sso = await call(`/auth/sso?jwt=${encodeURIComponent(token)}`);
        const sessionValue = sso.headers
            .get('Set-Cookie')
            .split(';')[0]
            .split('=')
            .slice(1)
            .join('=');
        const cookie = { Cookie: `cb_session=${sessionValue}` };

        const noOrigin = await call('/api/v1/posts', {
            method: 'POST',
            headers: cookie,
            body: { title: 'CSRF attempt' }
        });
        expect(noOrigin.status).toBe(403);

        const badOrigin = await call('/api/v1/posts', {
            method: 'POST',
            headers: { ...cookie, Origin: 'https://evil.example.com' },
            body: { title: 'CSRF attempt' }
        });
        expect(badOrigin.status).toBe(403);

        const goodOrigin = await call('/api/v1/posts', {
            method: 'POST',
            headers: { ...cookie, Origin: 'https://feedback.example.com' },
            body: { title: 'Legit cookie post' }
        });
        expect(goodOrigin.status).toBe(201);
    });
});

describe('CORS', () => {
    it('echoes allowed origins with Vary and supports wildcards', async () => {
        const { call } = makeApp();
        const exact = await call('/api/v1/config', {
            headers: { Origin: 'https://app.example.com' }
        });
        expect(exact.headers.get('Access-Control-Allow-Origin')).toBe(
            'https://app.example.com'
        );
        expect(exact.headers.get('Vary')).toBe('Origin');

        const wildcard = await call('/api/v1/config', {
            headers: { Origin: 'https://pr-42.preview.example.com' }
        });
        expect(wildcard.headers.get('Access-Control-Allow-Origin')).toBe(
            'https://pr-42.preview.example.com'
        );

        const denied = await call('/api/v1/config', {
            headers: { Origin: 'https://evil.example.com' }
        });
        expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('allows credentials for exact origins but never for wildcards', async () => {
        const { call } = makeApp();
        const exact = await call('/api/v1/config', {
            headers: { Origin: 'https://app.example.com' }
        });
        expect(exact.headers.get('Access-Control-Allow-Credentials')).toBe(
            'true'
        );

        const wildcard = await call('/api/v1/config', {
            headers: { Origin: 'https://pr-42.preview.example.com' }
        });
        expect(wildcard.headers.get('Access-Control-Allow-Origin')).toBe(
            'https://pr-42.preview.example.com'
        );
        expect(
            wildcard.headers.get('Access-Control-Allow-Credentials')
        ).toBeNull();
    });

    it('rejects cookie-authed mutations from wildcard-matched origins', async () => {
        const { call } = makeApp();
        const token = await memberJwt({ sub: 'sso-wc', email: 'wc@x.com' });
        const sso = await call(`/auth/sso?jwt=${encodeURIComponent(token)}`);
        const sessionValue = sso.headers
            .get('Set-Cookie')
            .split(';')[0]
            .split('=')
            .slice(1)
            .join('=');
        // The origin matches the https://*.preview.example.com wildcard —
        // enough for CORS reads, never enough to ride the session cookie.
        const res = await call('/api/v1/posts', {
            method: 'POST',
            headers: {
                Cookie: `cb_session=${sessionValue}`,
                Origin: 'https://pr-42.preview.example.com'
            },
            body: { title: 'Wildcard CSRF attempt' }
        });
        expect(res.status).toBe(403);
    });

    it('answers preflight for allowed origins', async () => {
        const { call } = makeApp();
        const res = await call('/api/v1/posts', {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://app.example.com',
                'Access-Control-Request-Method': 'POST'
            }
        });
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Methods')).toContain(
            'POST'
        );
    });
});
