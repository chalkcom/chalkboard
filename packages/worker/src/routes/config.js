/** Board configuration: GET (public) and PUT (staff). */

import { STATUSES } from '@chalkcom/core/protocol';
import { json, errorResponse, readJson } from '../lib/http.js';
import { assistEnabled } from '../lib/assist.js';

/**
 * Read all config rows as a plain object (values are stored as JSON).
 * @param {D1Database} db
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readConfigRows(db) {
    const { results } = await db.prepare('SELECT key, value FROM config').all();
    /** @type {Record<string, unknown>} */
    const config = {};
    for (const row of results) {
        try {
            config[String(row.key)] = JSON.parse(String(row.value));
        } catch {
            config[String(row.key)] = row.value;
        }
    }
    return config;
}

/**
 * GET /api/v1/config — public board metadata. `createFeedbackApp` options
 * win over D1 config rows.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function getConfig(c) {
    const stored = await readConfigRows(c.env.DB);
    const { results: boards } = await c.env.DB.prepare(
        `SELECT id, slug, name, description, position FROM boards
         WHERE is_public = 1 ORDER BY position, created_at`
    ).all();
    const options = /** @type {any} */ (c.options);
    return json(
        {
            boardTitle: options.boardTitle ?? stored.boardTitle ?? 'Feedback',
            boards,
            statuses: STATUSES,
            topics: options.topics ?? stored.topics ?? [],
            theme: { ...(stored.theme ?? {}), ...(options.theme ?? {}) },
            allowAnonymousPosts: c.env.ALLOW_ANONYMOUS_POSTS === 'true',
            assist: { enabled: assistEnabled(c.env) }
        },
        200,
        { 'cache-control': 'public, s-maxage=60' }
    );
}

/**
 * PUT /api/v1/config — staff; writes config rows.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function putConfig(c) {
    const body = await readJson(c.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return errorResponse('expected a config object', 400);
    }
    const entries = Object.entries(body).slice(0, 50);
    const db = c.env.DB;
    if (entries.length > 0) {
        await db.batch(
            entries.map(([key, value]) =>
                db
                    .prepare(
                        `INSERT INTO config (key, value) VALUES (?, ?)
                         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
                    )
                    .bind(key.slice(0, 64), JSON.stringify(value))
            )
        );
    }
    return json({ ok: true, written: entries.length });
}

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
