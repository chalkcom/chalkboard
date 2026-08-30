import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, makeApp, staffJwt } from './helpers.js';

beforeAll(async () => {
    await applyMigrations();
});

const IMPORT_HEADERS = { Authorization: 'Bearer test-import-token' };

const payload = {
    posts: [
        {
            externalRef: 'fb-100',
            title: 'Imported: bulk menu edit',
            body: 'From the old tool',
            slug: 'bulk-menu-edit',
            status: 'planned',
            voteOffset: 7,
            createdAt: '2025-06-01T12:00:00.000Z',
            comments: [
                {
                    externalRef: 'fb-100-c1',
                    body: 'We need this too',
                    author: { email: 'voter1@example.com', name: 'V One' }
                }
            ],
            voters: [
                { email: 'voter1@example.com', name: 'V One' },
                { email: 'voter2@example.com', name: 'V Two' }
            ]
        },
        {
            externalRef: 'fb-101',
            title: 'Imported: table QR codes',
            voters: []
        }
    ]
};

describe('POST /api/v1/import', () => {
    it('rejects a missing or wrong token', async () => {
        const { call } = makeApp();
        expect(
            (
                await call('/api/v1/import', {
                    method: 'POST',
                    body: payload
                })
            ).status
        ).toBe(401);
        expect(
            (
                await call('/api/v1/import', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer nope' },
                    body: payload
                })
            ).status
        ).toBe(401);
    });

    it('dry run reports counts without writing', async () => {
        const { call } = makeApp();
        const res = await (
            await call('/api/v1/import', {
                method: 'POST',
                headers: IMPORT_HEADERS,
                body: { ...payload, dryRun: true }
            })
        ).json();
        expect(res.dryRun).toBe(true);
        expect(res.counts.created).toBe(2);
        expect(res.counts.votes).toBe(2);
        expect(res.counts.comments).toBe(1);

        const list = await (await call('/api/v1/posts')).json();
        expect(list.posts).toHaveLength(0);
    });

    it('imports posts with votes, offsets and comments', async () => {
        const { call } = makeApp();
        const res = await (
            await call('/api/v1/import', {
                method: 'POST',
                headers: IMPORT_HEADERS,
                body: payload
            })
        ).json();
        expect(res.counts.created).toBe(2);

        const post = await (await call('/api/v1/posts/bulk-menu-edit')).json();
        // 7 offset + 2 imported voters.
        expect(post.post.voteCount).toBe(9);
        expect(post.post.status).toBe('planned');
        expect(post.post.commentCount).toBe(1);
    });

    it('re-import is idempotent (upsert on external_ref)', async () => {
        const { call } = makeApp();
        await call('/api/v1/import', {
            method: 'POST',
            headers: IMPORT_HEADERS,
            body: payload
        });
        const second = await (
            await call('/api/v1/import', {
                method: 'POST',
                headers: IMPORT_HEADERS,
                body: payload
            })
        ).json();
        expect(second.counts.created).toBe(0);
        expect(second.counts.updated).toBe(2);

        const list = await (await call('/api/v1/posts')).json();
        expect(list.posts).toHaveLength(2);
        const post = await (await call('/api/v1/posts/bulk-menu-edit')).json();
        expect(post.post.voteCount).toBe(9);
        expect(post.post.commentCount).toBe(1);
    });

    it('caps the batch size', async () => {
        const { call } = makeApp();
        const big = {
            posts: Array.from({ length: 101 }, (_, i) => ({
                externalRef: `x-${i}`,
                title: `Post ${i}`
            }))
        };
        const res = await call('/api/v1/import', {
            method: 'POST',
            headers: IMPORT_HEADERS,
            body: big
        });
        expect(res.status).toBe(400);
    });
});

describe('export', () => {
    it('dumps all tables for staff', async () => {
        const { call } = makeApp();
        await call('/api/v1/import', {
            method: 'POST',
            headers: IMPORT_HEADERS,
            body: payload
        });
        const res = await call('/api/v1/export', { jwt: await staffJwt() });
        expect(res.status).toBe(200);
        const dump = await res.json();
        expect(dump.data.posts).toHaveLength(2);
        expect(dump.data.boards).toHaveLength(1);
        expect(Object.keys(dump.data)).toContain('votes');
    });
});
