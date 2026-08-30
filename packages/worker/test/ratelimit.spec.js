import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, makeApp, memberJwt } from './helpers.js';

beforeAll(async () => {
    await applyMigrations();
});

describe('rate limiting', () => {
    it('returns 429 after the post-create limit is spent', async () => {
        const { call } = makeApp();
        const jwt = await memberJwt({ sub: 'limited', email: 'l@x.com' });
        for (let i = 0; i < 10; i += 1) {
            const res = await call('/api/v1/posts', {
                method: 'POST',
                jwt,
                body: { title: `Post number ${i}` }
            });
            expect(res.status).toBe(201);
        }
        const blocked = await call('/api/v1/posts', {
            method: 'POST',
            jwt,
            body: { title: 'One too many' }
        });
        expect(blocked.status).toBe(429);

        // A different user is unaffected (per-user window).
        const other = await call('/api/v1/posts', {
            method: 'POST',
            jwt: await memberJwt({ sub: 'other', email: 'o@x.com' }),
            body: { title: 'Different user' }
        });
        expect(other.status).toBe(201);
    });
});

describe('events ingestion', () => {
    it('accepts valid events and rejects unknown types', async () => {
        const { call } = makeApp();
        const res = await (
            await call('/api/v1/events', {
                method: 'POST',
                body: [
                    {
                        type: 'hint_impression',
                        source: 'sdk',
                        topic: 'billing',
                        sessionId: 's1',
                        url: 'https://app.example.com/dash'
                    },
                    { type: 'made_up_event' }
                ]
            })
        ).json();
        expect(res.accepted).toBe(1);
        expect(res.rejected).toBe(1);
    });

    it('caps the batch at 20 events', async () => {
        const { call } = makeApp();
        const res = await call('/api/v1/events', {
            method: 'POST',
            body: Array.from({ length: 21 }, () => ({
                type: 'hint_impression'
            }))
        });
        expect(res.status).toBe(400);
    });
});
