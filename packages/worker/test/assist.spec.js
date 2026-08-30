import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { applyMigrations, makeApp, memberJwt, staffJwt } from './helpers.js';

beforeAll(async () => {
    await applyMigrations();
});

const ASSIST_ENV = { ANTHROPIC_API_KEY: 'test-anthropic-key' };

/**
 * Mock transport returning an Anthropic Messages API response whose text
 * block is the JSON-encoded `result`.
 * @param {unknown} result
 */
function transportReturning(result) {
    return vi.fn(async () =>
        Response.json({
            content: [{ type: 'text', text: JSON.stringify(result) }]
        })
    );
}

const QUESTIONS_RESULT = {
    questions: [
        { id: 'a', question: 'How often does this happen?' },
        { id: 'b', question: 'What do you do today instead?' }
    ]
};

describe('assist gating', () => {
    it('returns 503 from both routes when no API key is configured', async () => {
        const { call } = makeApp();
        const jwt = await memberJwt();
        for (const path of [
            '/api/v1/assist/interview',
            '/api/v1/assist/synthesize'
        ]) {
            const res = await call(path, {
                method: 'POST',
                jwt,
                body: { title: 'Needs more detail' }
            });
            expect(res.status).toBe(503);
            expect((await res.json()).error).toBe('assist disabled');
        }
    });

    it('is disabled by ASSIST_ENABLED=false even with a key', async () => {
        const { call } = makeApp(
            {},
            { ...ASSIST_ENV, ASSIST_ENABLED: 'false' }
        );
        const res = await call('/api/v1/assist/interview', {
            method: 'POST',
            jwt: await memberJwt(),
            body: { title: 'Needs more detail' }
        });
        expect(res.status).toBe(503);
    });

    it('is reflected in GET /api/v1/config', async () => {
        const { call: offCall } = makeApp();
        expect((await (await offCall('/api/v1/config')).json()).assist).toEqual(
            { enabled: false, contextSource: 'none' }
        );
        const { call: onCall } = makeApp({}, ASSIST_ENV);
        expect((await (await onCall('/api/v1/config')).json()).assist).toEqual({
            enabled: true,
            contextSource: 'none'
        });
    });

    it('requires membership', async () => {
        const { call } = makeApp({}, ASSIST_ENV);
        const res = await call('/api/v1/assist/interview', {
            method: 'POST',
            body: { title: 'Anonymous' }
        });
        expect(res.status).toBe(401);
    });
});

describe('POST /api/v1/assist/interview', () => {
    it('returns validated questions from the model response', async () => {
        const transport = transportReturning(QUESTIONS_RESULT);
        const { call } = makeApp({ assist: { transport } }, ASSIST_ENV);
        const res = await call('/api/v1/assist/interview', {
            method: 'POST',
            jwt: await memberJwt(),
            body: {
                title: 'Slow reports',
                body: 'They take ages',
                locale: 'en'
            }
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.questions).toEqual([
            { id: 'q1', question: 'How often does this happen?' },
            { id: 'q2', question: 'What do you do today instead?' }
        ]);
        expect(data.model).toBe('claude-opus-5');

        // Request shape: key header, version, structured-output format.
        const [url, init] = transport.mock.calls[0];
        expect(url).toBe('https://api.anthropic.com/v1/messages');
        expect(init.headers['x-api-key']).toBe('test-anthropic-key');
        expect(init.headers['anthropic-version']).toBe('2023-06-01');
        const sent = JSON.parse(init.body);
        expect(sent.model).toBe('claude-opus-5');
        expect(sent.output_config.format.type).toBe('json_schema');
        expect(sent.output_config.effort).toBe('low');
        // The draft rides as data inside a JSON payload, not as prompt.
        expect(JSON.parse(sent.messages[0].content).draft.title).toBe(
            'Slow reports'
        );
    });

    it('caps questions at 3 and drops malformed entries', async () => {
        const transport = transportReturning({
            questions: [
                { id: '1', question: 'One?' },
                { id: '2', question: '' },
                { id: '3', question: 'Two?' },
                { id: '4', question: 'x'.repeat(400) },
                { id: '5', question: 'Three?' },
                { id: '6', question: 'Four?' }
            ]
        });
        const { call } = makeApp({ assist: { transport } }, ASSIST_ENV);
        const data = await (
            await call('/api/v1/assist/interview', {
                method: 'POST',
                jwt: await memberJwt(),
                body: { title: 'Cap me' }
            })
        ).json();
        expect(data.questions.map(q => q.question)).toEqual([
            'One?',
            'Two?',
            'Three?'
        ]);
    });

    it('fails open with empty questions on malformed model JSON', async () => {
        const transport = vi.fn(async () =>
            Response.json({
                content: [{ type: 'text', text: 'not json at all' }]
            })
        );
        const { call } = makeApp({ assist: { transport } }, ASSIST_ENV);
        const data = await (
            await call('/api/v1/assist/interview', {
                method: 'POST',
                jwt: await memberJwt(),
                body: { title: 'Broken model' }
            })
        ).json();
        expect(data.questions).toEqual([]);
    });

    it('fails open when the transport throws', async () => {
        const transport = vi.fn(async () => {
            throw new Error('network down');
        });
        const { call } = makeApp({ assist: { transport } }, ASSIST_ENV);
        const res = await call('/api/v1/assist/interview', {
            method: 'POST',
            jwt: await memberJwt(),
            body: { title: 'Offline' }
        });
        expect(res.status).toBe(200);
        expect((await res.json()).questions).toEqual([]);
    });

    it('retries once without output_config.format on a 400', async () => {
        const transport = vi.fn();
        transport.mockResolvedValueOnce(
            Response.json(
                { error: { type: 'invalid_request_error' } },
                {
                    status: 400
                }
            )
        );
        transport.mockResolvedValueOnce(
            Response.json({
                content: [
                    {
                        type: 'text',
                        text: `Here you go: ${JSON.stringify(QUESTIONS_RESULT)}`
                    }
                ]
            })
        );
        const { call } = makeApp({ assist: { transport } }, ASSIST_ENV);
        const data = await (
            await call('/api/v1/assist/interview', {
                method: 'POST',
                jwt: await memberJwt(),
                body: { title: 'Retry path' }
            })
        ).json();
        expect(data.questions).toHaveLength(2);
        expect(transport).toHaveBeenCalledTimes(2);
        const retryBody = JSON.parse(transport.mock.calls[1][1].body);
        expect(retryBody.output_config.format).toBeUndefined();
    });

    it('sends requests to ASSIST_API_URL when configured', async () => {
        const transport = transportReturning({ questions: [] });
        const gateway =
            'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/v1/messages';
        const { call } = makeApp(
            { assist: { transport } },
            { ...ASSIST_ENV, ASSIST_API_URL: gateway }
        );
        await call('/api/v1/assist/interview', {
            method: 'POST',
            jwt: await memberJwt(),
            body: { title: 'Via the gateway' }
        });
        const [url, init] = transport.mock.calls[0];
        expect(url).toBe(gateway);
        // The key header is sent to the override endpoint too.
        expect(init.headers['x-api-key']).toBe('test-anthropic-key');
    });

    it('honours the model precedence chain', async () => {
        const transport = transportReturning({ questions: [] });
        // Option beats env var.
        const { call } = makeApp(
            { assist: { transport, model: 'claude-haiku-4-5' } },
            { ...ASSIST_ENV, ASSIST_MODEL: 'claude-sonnet-5' }
        );
        await call('/api/v1/assist/interview', {
            method: 'POST',
            jwt: await memberJwt(),
            body: { title: 'Which model?' }
        });
        expect(JSON.parse(transport.mock.calls[0][1].body).model).toBe(
            'claude-haiku-4-5'
        );

        // Env var beats the default when no option is set.
        const transport2 = transportReturning({ questions: [] });
        const { call: call2 } = makeApp(
            { assist: { transport: transport2 } },
            { ...ASSIST_ENV, ASSIST_MODEL: 'claude-sonnet-5' }
        );
        await call2('/api/v1/assist/interview', {
            method: 'POST',
            jwt: await memberJwt(),
            body: { title: 'Which model now?' }
        });
        expect(JSON.parse(transport2.mock.calls[0][1].body).model).toBe(
            'claude-sonnet-5'
        );
    });

    it('rate limits interviews per user', async () => {
        const transport = transportReturning({ questions: [] });
        const { call } = makeApp({ assist: { transport } }, ASSIST_ENV);
        const jwt = await memberJwt({
            sub: 'assist-limited',
            email: 'al@x.com'
        });
        for (let i = 0; i < 10; i += 1) {
            const res = await call('/api/v1/assist/interview', {
                method: 'POST',
                jwt,
                body: { title: `Attempt ${i}` }
            });
            expect(res.status).toBe(200);
        }
        const blocked = await call('/api/v1/assist/interview', {
            method: 'POST',
            jwt,
            body: { title: 'One too many' }
        });
        expect(blocked.status).toBe(429);
    });
});

describe('POST /api/v1/assist/synthesize', () => {
    const answers = [
        { question: 'How often?', answer: 'Every Monday when we reconcile.' }
    ];

    it('returns a validated synthesis with duplicates', async () => {
        const transport = transportReturning({
            title: 'Add CSV export to the orders list',
            body: 'Reconciling takes an hour every **Monday**.',
            suggestedTopic: 'reports'
        });
        const { call } = makeApp({ assist: { transport } }, ASSIST_ENV);
        const res = await call('/api/v1/assist/synthesize', {
            method: 'POST',
            jwt: await memberJwt(),
            body: { title: 'csv export', body: 'need it', answers }
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.synthesis.title).toBe('Add CSV export to the orders list');
        expect(data.synthesis.suggestedTopic).toBe('reports');
        expect(Array.isArray(data.duplicates)).toBe(true);
        // The answers are forwarded in the structured payload.
        const sent = JSON.parse(transport.mock.calls[0][1].body);
        expect(JSON.parse(sent.messages[0].content).answers).toEqual(answers);
    });

    it('rejects oversized or invalid model output with 502', async () => {
        const transport = transportReturning({
            title: 't'.repeat(300),
            body: 'too long a title'
        });
        const { call } = makeApp({ assist: { transport } }, ASSIST_ENV);
        const res = await call('/api/v1/assist/synthesize', {
            method: 'POST',
            jwt: await memberJwt(),
            body: { title: 'valid draft', answers }
        });
        expect(res.status).toBe(502);
    });

    it('returns 502 when the transport fails', async () => {
        const transport = vi.fn(async () => {
            throw new Error('timeout');
        });
        const { call } = makeApp({ assist: { transport } }, ASSIST_ENV);
        const res = await call('/api/v1/assist/synthesize', {
            method: 'POST',
            jwt: await memberJwt(),
            body: { title: 'valid draft', answers }
        });
        expect(res.status).toBe(502);
    });

    it('rejects malformed answers', async () => {
        const transport = transportReturning({ title: 'x', body: 'y' });
        const { call } = makeApp({ assist: { transport } }, ASSIST_ENV);
        const tooLong = await call('/api/v1/assist/synthesize', {
            method: 'POST',
            jwt: await memberJwt(),
            body: {
                title: 'valid draft',
                answers: [{ question: 'q', answer: 'a'.repeat(2001) }]
            }
        });
        expect(tooLong.status).toBe(400);
        const tooMany = await call('/api/v1/assist/synthesize', {
            method: 'POST',
            jwt: await memberJwt(),
            body: {
                title: 'valid draft',
                answers: Array.from({ length: 4 }, () => ({
                    question: 'q',
                    answer: 'a'
                }))
            }
        });
        expect(tooMany.status).toBe(400);
        expect(transport).not.toHaveBeenCalled();
    });
});

describe('interview storage on posts', () => {
    const interview = {
        originalTitle: 'csv plz',
        originalBody: 'want csv',
        questions: [{ id: 'q1', question: 'How often?' }],
        answers: [{ question: 'How often?', answer: 'Weekly.' }],
        model: 'claude-opus-5'
    };

    it('stores the interview with the post and shows it to staff only', async () => {
        const { call } = makeApp();
        const res = await call('/api/v1/posts', {
            method: 'POST',
            jwt: await memberJwt(),
            body: {
                title: 'Add CSV export',
                body: 'Synthesised body',
                interview
            }
        });
        expect(res.status).toBe(201);
        const { post } = await res.json();

        const row = await env.DB.prepare(
            'SELECT * FROM post_interviews WHERE post_id = ?'
        )
            .bind(post.id)
            .first();
        expect(row.original_title).toBe('csv plz');
        expect(JSON.parse(row.answers_json)).toEqual(interview.answers);
        expect(JSON.parse(row.synthesis_json).title).toBe('Add CSV export');

        const asStaff = await (
            await call(`/api/v1/posts/${post.id}`, { jwt: await staffJwt() })
        ).json();
        expect(asStaff.post.interview.originalTitle).toBe('csv plz');
        expect(asStaff.post.interview.questions).toHaveLength(1);

        const asMember = await (
            await call(`/api/v1/posts/${post.id}`, { jwt: await memberJwt() })
        ).json();
        expect(asMember.post.interview).toBeUndefined();
        const asPublic = await (await call(`/api/v1/posts/${post.id}`)).json();
        expect(asPublic.post.interview).toBeUndefined();
    });

    it('rejects malformed and oversized interview payloads', async () => {
        const { call } = makeApp();
        const jwt = await memberJwt();
        const malformed = await call('/api/v1/posts', {
            method: 'POST',
            jwt,
            body: { title: 'Bad interview', interview: { nope: true } }
        });
        expect(malformed.status).toBe(400);

        const oversized = await call('/api/v1/posts', {
            method: 'POST',
            jwt,
            body: {
                title: 'Huge interview',
                interview: {
                    ...interview,
                    answers: [{ question: 'q', answer: 'a'.repeat(21 * 1024) }]
                }
            }
        });
        expect(oversized.status).toBe(400);
        expect((await oversized.json()).error).toBe('interview too large');
    });

    it('posting without an interview stores nothing extra', async () => {
        const { call } = makeApp();
        const res = await call('/api/v1/posts', {
            method: 'POST',
            jwt: await memberJwt(),
            body: { title: 'Plain post' }
        });
        const { post } = await res.json();
        const row = await env.DB.prepare(
            'SELECT COUNT(*) AS n FROM post_interviews WHERE post_id = ?'
        )
            .bind(post.id)
            .first();
        expect(Number(row.n)).toBe(0);
    });
});
