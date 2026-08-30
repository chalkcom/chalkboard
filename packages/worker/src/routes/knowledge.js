/**
 * Documentation knowledge base feeding the AI interviewer. Chunks are
 * ingested from the owner's docs (see tools/ingest-docs.mjs), indexed with
 * FTS5, and retrieved as grounding excerpts for the assist calls — the
 * basis of the "this might already exist" deflection.
 */

import {
    json,
    errorResponse,
    readJson,
    nowIso,
    truncate
} from '../lib/http.js';
import { secretsEqual } from '../lib/auth.js';
import { toFtsQuery } from '../lib/db.js';

const MAX_BATCH = 100;
const MAX_CHUNK_LENGTH = 4000;
const MAX_TOTAL_CHARS = MAX_BATCH * MAX_CHUNK_LENGTH;
const EXCERPT_LENGTH = 1500;

/**
 * Stable id for a chunk when the caller does not supply one.
 * @param {string} source
 * @param {string} url
 * @param {number} index
 * @returns {Promise<string>}
 */
async function chunkId(source, url, index) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${source}\n${url}\n${index}`)
    );
    return Array.from(new Uint8Array(digest).slice(0, 8))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Knowledge writes are for operators: staff session/JWT or the import
 * token both work (the ingest CLI uses the token).
 * @param {import('../lib/router.js').RouteContext} c
 * @returns {Promise<boolean>}
 */
async function canWriteKnowledge(c) {
    if (c.auth?.isStaff) return true;
    const header = c.request.headers.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    return Boolean(
        c.env.IMPORT_TOKEN &&
        token &&
        (await secretsEqual(token, c.env.IMPORT_TOKEN))
    );
}

/**
 * POST /api/v1/knowledge — idempotent batch upsert (≤100 chunks).
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function ingestKnowledge(c) {
    if (!(await canWriteKnowledge(c))) {
        return errorResponse('staff or import token required', 401);
    }
    const body = /** @type {any} */ (await readJson(c.request)) ?? {};
    const items = Array.isArray(body) ? body : body.items;
    if (!Array.isArray(items)) {
        return errorResponse('items array required', 400);
    }
    if (items.length > MAX_BATCH) {
        return errorResponse(`at most ${MAX_BATCH} chunks per call`, 400);
    }

    const db = c.env.DB;
    const now = nowIso();
    const statements = [];
    let rejected = 0;
    let totalChars = 0;
    for (const [index, item] of items.entries()) {
        const statement = await upsertChunkStmt(db, item, index, now);
        if (!statement) {
            rejected += 1;
            continue;
        }
        totalChars += statement.chunkLength;
        if (totalChars > MAX_TOTAL_CHARS) {
            return errorResponse('batch too large', 400);
        }
        statements.push(statement.stmt);
    }
    if (statements.length > 0) await db.batch(statements);
    return json({ written: statements.length, rejected });
}

/**
 * Build the upsert statement for one chunk, or null when it is invalid.
 * @param {any} db
 * @param {any} item
 * @param {number} index
 * @param {string} now
 * @returns {Promise<{ stmt: any, chunkLength: number } | null>}
 */
async function upsertChunkStmt(db, item, index, now) {
    const source =
        typeof item?.source === 'string' ? item.source.slice(0, 100) : '';
    const chunk = typeof item?.chunk === 'string' ? item.chunk : '';
    if (!source || !chunk || chunk.length > MAX_CHUNK_LENGTH) return null;
    const url = truncate(item.url, 500) ?? '';
    const id =
        typeof item.id === 'string' && item.id
            ? item.id.slice(0, 64)
            : await chunkId(source, url, index);
    const stmt = db
        .prepare(
            `INSERT INTO knowledge (id, source, url, title, chunk, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET source = excluded.source,
               url = excluded.url, title = excluded.title,
               chunk = excluded.chunk, updated_at = excluded.updated_at`
        )
        .bind(id, source, url || null, truncate(item.title, 200), chunk, now);
    return { stmt, chunkLength: chunk.length };
}

/**
 * DELETE /api/v1/knowledge?source= — staff; clears a source before
 * re-ingest.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function deleteKnowledge(c) {
    const source = c.url.searchParams.get('source');
    if (!source) return errorResponse('source query param required', 400);
    // Count first: meta.changes on the DELETE also counts the FTS
    // trigger's shadow-table writes.
    const before = await c.env.DB.prepare(
        'SELECT COUNT(*) AS n FROM knowledge WHERE source = ?'
    )
        .bind(source)
        .first();
    await c.env.DB.prepare('DELETE FROM knowledge WHERE source = ?')
        .bind(source)
        .run();
    return json({ deleted: Number(before?.n ?? 0) });
}

/**
 * Top matching documentation excerpts for a draft, for grounding.
 * @param {any} db
 * @param {string} text draft title + body
 * @returns {Promise<Array<{ title: string | null, url: string | null, excerpt: string }>>}
 */
export async function retrieveKnowledge(db, text) {
    const match = toFtsQuery(text);
    if (!match) return [];
    try {
        const { results } = await db
            .prepare(
                `SELECT k.title, k.url, k.chunk
                 FROM knowledge_fts f JOIN knowledge k ON k.id = f.knowledge_id
                 WHERE knowledge_fts MATCH ?
                 ORDER BY bm25(knowledge_fts) LIMIT 3`
            )
            .bind(match)
            .all();
        return results.map(row => ({
            title: row.title ?? null,
            url: row.url ?? null,
            excerpt: String(row.chunk).slice(0, EXCERPT_LENGTH)
        }));
    } catch {
        // Knowledge is optional grounding; never fail an assist call on it.
        return [];
    }
}
