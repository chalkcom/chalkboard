/** POST /api/v1/events — anonymous analytics ingestion. */

import { EVENT_NAMES } from '@chalkcom/core/protocol';
import {
    json,
    errorResponse,
    readJson,
    nowIso,
    truncate
} from '../lib/http.js';

const VALID_TYPES = new Set(Object.values(EVENT_NAMES));
const MAX_BATCH = 20;

/**
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function ingestEvents(c) {
    const body = await readJson(c.request);
    const events = Array.isArray(body)
        ? body
        : Array.isArray(/** @type {any} */ (body)?.events)
          ? /** @type {any} */ (body).events
          : null;
    if (!events) return errorResponse('expected an array of events', 400);
    if (events.length > MAX_BATCH) {
        return errorResponse(`at most ${MAX_BATCH} events per call`, 400);
    }
    const now = nowIso();
    const db = c.env.DB;
    const statements = [];
    let rejected = 0;
    for (const event of events) {
        if (!event || !VALID_TYPES.has(event.type)) {
            rejected += 1;
            continue;
        }
        statements.push(
            db
                .prepare(
                    `INSERT INTO events (type, source, topic, post_id,
                     user_id, session_id, url, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                )
                .bind(
                    event.type,
                    truncate(event.source, 40),
                    truncate(event.topic, 64),
                    truncate(event.postId, 32),
                    c.auth?.userId ?? null,
                    truncate(event.sessionId, 64),
                    truncate(event.url, 500),
                    now
                )
        );
    }
    if (statements.length > 0) await db.batch(statements);
    return json({ accepted: statements.length, rejected }, 202);
}
