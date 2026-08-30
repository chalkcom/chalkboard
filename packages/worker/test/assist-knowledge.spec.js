import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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

const ASSIST_ENV = { ANTHROPIC_API_KEY: 'test-anthropic-key' };

/** @param {unknown} result */
function transportReturning(result) {
    return vi.fn(async () =>
        Response.json({
            content: [{ type: 'text', text: JSON.stringify(result) }]
        })
    );
}

/** @param {import('vitest').Mock} transport */
function sentRequest(transport, call = 0) {
    const [, init] = transport.mock.calls[call];
    const body = JSON.parse(init.body);
    return {
        body,
        system: body.system[0].text,
        payload: JSON.parse(body.messages[0].content)
    };
}

/** @param {(path: string, init?: object) => Promise<Response>} call */
async function interview(call, jwt, draft) {
    return (
        await call('/api/v1/assist/interview', {
            method: 'POST',
            jwt,
            body: draft
        })
    ).json();
}

describe('product briefing in the system prompt', () => {
    it('includes the briefing and topic addendum from options', async () => {
        const transport = transportReturning({ questions: [] });
        const { call } = makeApp(
            {
                assist: {
                    transport,
                    context: 'StoreKit is a hospitality ordering platform.'
                },
                topics: [
                    {
                        id: 'menu',
                        label: 'Menu',
                        context: 'Menus have sections; items have modifiers.'
                    }
                ]
            },
            ASSIST_ENV
        );
        await interview(call, await memberJwt(), {
            title: 'Menu editing is slow',
            topic: 'menu'
        });
        const { system } = sentRequest(transport);
        expect(system).toContain('PRODUCT BRIEFING');
        expect(system).toContain('not instructions that');
        expect(system).toContain('hospitality ordering platform');
        expect(system).toContain('items have modifiers');
        // The fixed interviewer rules stay in front and authoritative.
        expect(system.indexOf('DATA from an end user')).toBeLessThan(
            system.indexOf('PRODUCT BRIEFING')
        );
    });

    it('uses the config row when no option is set, option wins otherwise', async () => {
        const staff = await staffJwt();
        const rowApp = makeApp(
            { assist: { transport: transportReturning({ questions: [] }) } },
            ASSIST_ENV
        );
        await rowApp.call('/api/v1/config', {
            method: 'PUT',
            jwt: staff,
            body: { 'assist.context': 'Row-level briefing text.' }
        });
        const rowTransport = transportReturning({ questions: [] });
        const { call } = makeApp(
            { assist: { transport: rowTransport } },
            ASSIST_ENV
        );
        await interview(call, await memberJwt(), { title: 'From the row' });
        expect(sentRequest(rowTransport).system).toContain(
            'Row-level briefing text.'
        );

        const optionTransport = transportReturning({ questions: [] });
        const { call: call2 } = makeApp(
            {
                assist: {
                    transport: optionTransport,
                    context: 'Option-level briefing wins.'
                }
            },
            ASSIST_ENV
        );
        await interview(call2, await memberJwt(), { title: 'From options' });
        const system2 = sentRequest(optionTransport).system;
        expect(system2).toContain('Option-level briefing wins.');
        expect(system2).not.toContain('Row-level briefing text.');
    });

    it('omits the briefing section entirely when none is configured', async () => {
        const transport = transportReturning({ questions: [] });
        const { call } = makeApp({ assist: { transport } }, ASSIST_ENV);
        await interview(call, await memberJwt(), { title: 'No briefing' });
        expect(sentRequest(transport).system).not.toContain('PRODUCT BRIEFING');
    });

    it('clamps an over-cap option briefing', async () => {
        const transport = transportReturning({ questions: [] });
        const { call } = makeApp(
            { assist: { transport, context: 'x'.repeat(20000) } },
            ASSIST_ENV
        );
        await interview(call, await memberJwt(), { title: 'Clamped' });
        const { system } = sentRequest(transport);
        expect(system.length).toBeLessThan(18000);
    });
});

describe('briefing config surface', () => {
    it('reports contextSource in GET /api/v1/config without echoing text', async () => {
        const none = makeApp({}, ASSIST_ENV);
        expect(
            (await (await none.call('/api/v1/config')).json()).assist
                .contextSource
        ).toBe('none');

        await makeApp({}, ASSIST_ENV).call('/api/v1/config', {
            method: 'PUT',
            jwt: await staffJwt(),
            body: { 'assist.context': 'Secret internal briefing' }
        });
        const rowConfig = await (
            await makeApp({}, ASSIST_ENV).call('/api/v1/config')
        ).json();
        expect(rowConfig.assist.contextSource).toBe('config');
        expect(JSON.stringify(rowConfig)).not.toContain(
            'Secret internal briefing'
        );

        const option = makeApp(
            { assist: { context: 'From code' } },
            ASSIST_ENV
        );
        expect(
            (await (await option.call('/api/v1/config')).json()).assist
                .contextSource
        ).toBe('option');
    });

    it('rejects over-cap writes', async () => {
        const { call } = makeApp();
        const staff = await staffJwt();
        const tooBig = await call('/api/v1/config', {
            method: 'PUT',
            jwt: staff,
            body: { 'assist.context': 'x'.repeat(16001) }
        });
        expect(tooBig.status).toBe(400);
        const badTopic = await call('/api/v1/config', {
            method: 'PUT',
            jwt: staff,
            body: {
                topics: [{ id: 't', label: 'T', context: 'y'.repeat(2001) }]
            }
        });
        expect(badTopic.status).toBe(400);
    });

    it('exposes the raw row to staff only via /api/v1/staff/assist', async () => {
        const { call } = makeApp(
            { assist: { context: 'Code override' } },
            ASSIST_ENV
        );
        await call('/api/v1/config', {
            method: 'PUT',
            jwt: await staffJwt(),
            body: { 'assist.context': 'Stored row value' }
        });
        const staffView = await (
            await call('/api/v1/staff/assist', { jwt: await staffJwt() })
        ).json();
        expect(staffView.context).toBe('Stored row value');
        expect(staffView.source).toBe('option');
        expect(staffView.effectiveContext).toBe('Code override');

        expect(
            (await call('/api/v1/staff/assist', { jwt: await memberJwt() }))
                .status
        ).toBe(403);
    });
});

describe('knowledge base', () => {
    const CHUNKS = {
        items: [
            {
                id: 'csv-docs-1',
                source: 'docs',
                url: 'https://docs.example.com/exports',
                title: 'Exporting orders',
                chunk: 'You can export orders as CSV from Reports → Orders → Export. The export respects the current filters.'
            },
            {
                id: 'qr-docs-1',
                source: 'docs',
                url: 'https://docs.example.com/qr',
                title: 'Table QR codes',
                chunk: 'Print per-table QR codes from Settings → Tables.'
            }
        ]
    };

    it('accepts staff and import-token writers, rejects others', async () => {
        const { call } = makeApp();
        expect(
            (
                await call('/api/v1/knowledge', {
                    method: 'POST',
                    body: CHUNKS
                })
            ).status
        ).toBe(401);
        expect(
            (
                await call('/api/v1/knowledge', {
                    method: 'POST',
                    jwt: await memberJwt(),
                    body: CHUNKS
                })
            ).status
        ).toBe(401);
        expect(
            (
                await call('/api/v1/knowledge', {
                    method: 'POST',
                    jwt: await staffJwt(),
                    body: CHUNKS
                })
            ).status
        ).toBe(200);
        expect(
            (
                await call('/api/v1/knowledge', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer test-import-token' },
                    body: CHUNKS
                })
            ).status
        ).toBe(200);
    });

    it('upserts idempotently and deletes by source', async () => {
        const { call } = makeApp();
        const staff = await staffJwt();
        await call('/api/v1/knowledge', {
            method: 'POST',
            jwt: staff,
            body: CHUNKS
        });
        // Re-ingest with an edited chunk: same ids, no duplicates.
        const edited = {
            items: [
                { ...CHUNKS.items[0], chunk: 'Updated export docs chunk.' },
                CHUNKS.items[1]
            ]
        };
        const second = await (
            await call('/api/v1/knowledge', {
                method: 'POST',
                jwt: staff,
                body: edited
            })
        ).json();
        expect(second.written).toBe(2);
        const count = await env.DB.prepare(
            "SELECT COUNT(*) AS n FROM knowledge WHERE source = 'docs'"
        ).first();
        expect(Number(count.n)).toBe(2);
        const row = await env.DB.prepare(
            "SELECT chunk FROM knowledge WHERE id = 'csv-docs-1'"
        ).first();
        expect(row.chunk).toBe('Updated export docs chunk.');

        const deleted = await (
            await call('/api/v1/knowledge?source=docs', {
                method: 'DELETE',
                jwt: staff
            })
        ).json();
        expect(deleted.deleted).toBe(2);
        const left = await env.DB.prepare(
            'SELECT COUNT(*) AS n FROM knowledge'
        ).first();
        expect(Number(left.n)).toBe(0);
    });

    it('enforces per-chunk and batch caps', async () => {
        const { call } = makeApp();
        const staff = await staffJwt();
        const res = await (
            await call('/api/v1/knowledge', {
                method: 'POST',
                jwt: staff,
                body: {
                    items: [
                        { source: 'docs', chunk: 'ok chunk' },
                        { source: 'docs', chunk: 'z'.repeat(4001) },
                        { source: '', chunk: 'no source' }
                    ]
                }
            })
        ).json();
        expect(res.written).toBe(1);
        expect(res.rejected).toBe(2);

        const tooMany = await call('/api/v1/knowledge', {
            method: 'POST',
            jwt: staff,
            body: {
                items: Array.from({ length: 101 }, (_, i) => ({
                    source: 'docs',
                    chunk: `c${i}`
                }))
            }
        });
        expect(tooMany.status).toBe(400);
    });

    it('feeds retrieved excerpts into the assist payload', async () => {
        const { call } = makeApp();
        await call('/api/v1/knowledge', {
            method: 'POST',
            jwt: await staffJwt(),
            body: CHUNKS
        });
        const transport = transportReturning({ questions: [] });
        const assistApp = makeApp({ assist: { transport } }, ASSIST_ENV);
        await interview(assistApp.call, await memberJwt(), {
            title: 'Export orders as CSV',
            body: 'I need a csv export of orders'
        });
        const { payload } = sentRequest(transport);
        expect(payload.knowledge.length).toBeGreaterThanOrEqual(1);
        expect(payload.knowledge[0].url).toBe(
            'https://docs.example.com/exports'
        );
        expect(payload.knowledge[0].excerpt).toContain('export orders as CSV');
    });
});

describe('existing-feature deflection', () => {
    it('passes a sanitized existingFeature through', async () => {
        const transport = transportReturning({
            questions: [],
            existingFeature: {
                summary: 'CSV export already exists under Reports → Orders.',
                url: 'https://docs.example.com/exports'
            }
        });
        const { call } = makeApp({ assist: { transport } }, ASSIST_ENV);
        const res = await interview(call, await memberJwt(), {
            title: 'csv export?'
        });
        expect(res.existingFeature).toEqual({
            summary: 'CSV export already exists under Reports → Orders.',
            url: 'https://docs.example.com/exports'
        });
    });

    it('drops non-http urls and absent summaries', async () => {
        const badUrl = transportReturning({
            questions: [],
            existingFeature: {
                summary: 'Exists.',
                url: 'javascript:alert(1)'
            }
        });
        const { call } = makeApp({ assist: { transport: badUrl } }, ASSIST_ENV);
        const res = await interview(call, await memberJwt(), { title: 'x?' });
        expect(res.existingFeature.url).toBeNull();

        const noSummary = transportReturning({
            questions: [],
            existingFeature: { summary: '' }
        });
        const { call: call2 } = makeApp(
            { assist: { transport: noSummary } },
            ASSIST_ENV
        );
        const res2 = await interview(call2, await memberJwt(), {
            title: 'y?'
        });
        expect(res2.existingFeature).toBeUndefined();
    });
});

describe('board-aware duplicate context', () => {
    it('sends similar posts with status, votes and the latest team reply', async () => {
        const { call } = makeApp();
        const post = await createPostAs(call, await memberJwt(), {
            title: 'Bulk edit menu items please'
        });
        await call(`/api/v1/posts/${post.id}/status`, {
            method: 'PATCH',
            jwt: await staffJwt(),
            body: { status: 'in_progress' }
        });
        await call(`/api/v1/posts/${post.id}/comments`, {
            method: 'POST',
            jwt: await staffJwt(),
            body: { body: 'We are building this now — beta in October.' }
        });

        const transport = transportReturning({ questions: [] });
        const assistApp = makeApp({ assist: { transport } }, ASSIST_ENV);
        await interview(assistApp.call, await memberJwt(), {
            title: 'bulk edit for menu items'
        });
        const { payload } = sentRequest(transport);
        const similar = payload.similarPosts.find(p => p.slug === post.slug);
        expect(similar.status).toBe('in_progress');
        expect(similar.voteCount).toBe(0);
        expect(similar.latestTeamReply).toContain('beta in October');
    });

    it('synthesize duplicates carry status', async () => {
        const { call } = makeApp();
        const post = await createPostAs(call, await memberJwt(), {
            title: 'Weekly sales digest email'
        });
        await call(`/api/v1/posts/${post.id}/status`, {
            method: 'PATCH',
            jwt: await staffJwt(),
            body: { status: 'planned' }
        });

        const transport = transportReturning({
            title: 'Weekly sales digest',
            body: 'A weekly email with totals.'
        });
        const assistApp = makeApp({ assist: { transport } }, ASSIST_ENV);
        const res = await (
            await assistApp.call('/api/v1/assist/synthesize', {
                method: 'POST',
                jwt: await memberJwt(),
                body: {
                    title: 'weekly sales email',
                    answers: [{ question: 'q', answer: 'a' }]
                }
            })
        ).json();
        const dupe = res.duplicates.find(d => d.slug === post.slug);
        expect(dupe.status).toBe('planned');
    });
});
