/** Staff-only triage queue, metrics and export. */

import { json, errorResponse } from '../lib/http.js';
import { serializePost } from '../lib/db.js';

/**
 * GET /api/v1/staff/queue?filter=untagged|unanswered|new&since=
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function staffQueue(c) {
    const filter = c.url.searchParams.get('filter') || 'new';
    const since = c.url.searchParams.get('since');
    const where = ['p.deleted_at IS NULL', 'p.merged_into_id IS NULL'];
    /** @type {unknown[]} */
    const binds = [];
    if (filter === 'untagged') {
        where.push(
            'NOT EXISTS(SELECT 1 FROM post_tags pt WHERE pt.post_id = p.id)'
        );
    } else if (filter === 'unanswered') {
        where.push(
            `NOT EXISTS(SELECT 1 FROM comments cm WHERE cm.post_id = p.id
              AND cm.is_team = 1 AND cm.deleted_at IS NULL)`
        );
    } else if (filter !== 'new') {
        return errorResponse('unknown filter', 400);
    }
    if (since) {
        where.push('p.created_at > ?');
        binds.push(since);
    }
    const { results } = await c.env.DB.prepare(
        `SELECT p.*, u.name AS author_name FROM posts p
         LEFT JOIN users u ON u.id = p.author_id
         WHERE ${where.join(' AND ')}
         ORDER BY p.created_at DESC LIMIT 100`
    )
        .bind(...binds)
        .all();
    return json({ filter, posts: results.map(row => serializePost(row)) });
}

/**
 * GET /api/v1/staff/metrics — monthly posts/votes/participants and the
 * hint → overlay → submit event funnel.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function staffMetrics(c) {
    const db = c.env.DB;
    const [posts, votes, participants, funnel] = await Promise.all([
        db
            .prepare(
                `SELECT strftime('%Y-%m', created_at) AS month,
                 COUNT(*) AS count FROM posts WHERE deleted_at IS NULL
                 GROUP BY month ORDER BY month DESC LIMIT 12`
            )
            .all(),
        db
            .prepare(
                `SELECT strftime('%Y-%m', created_at) AS month,
                 COUNT(*) AS count FROM votes
                 GROUP BY month ORDER BY month DESC LIMIT 12`
            )
            .all(),
        db
            .prepare(
                `SELECT month, COUNT(*) AS count FROM (
                   SELECT strftime('%Y-%m', created_at) AS month,
                          author_id AS uid FROM posts
                   WHERE author_id IS NOT NULL AND deleted_at IS NULL
                   UNION
                   SELECT strftime('%Y-%m', created_at), user_id FROM votes
                   UNION
                   SELECT strftime('%Y-%m', created_at), author_id
                   FROM comments WHERE author_id IS NOT NULL
                 ) GROUP BY month ORDER BY month DESC LIMIT 12`
            )
            .all(),
        db
            .prepare(
                `SELECT type, COUNT(*) AS count FROM events
                 GROUP BY type ORDER BY count DESC`
            )
            .all()
    ]);
    return json({
        monthly: {
            posts: posts.results,
            votes: votes.results,
            participants: participants.results
        },
        funnel: Object.fromEntries(
            funnel.results.map(row => [row.type, Number(row.count)])
        )
    });
}

/**
 * GET /api/v1/export — staff; full JSON dump.
 * @param {import('../lib/router.js').RouteContext} c
 */
export async function exportAll(c) {
    const db = c.env.DB;
    const tables = [
        'boards',
        'users',
        'posts',
        'votes',
        'comments',
        'tags',
        'post_tags',
        'config'
    ];
    /** @type {Record<string, unknown[]>} */
    const dump = {};
    for (const table of tables) {
        const { results } = await db.prepare(`SELECT * FROM ${table}`).all();
        dump[table] = results;
    }
    return json({
        exportedAt: new Date().toISOString(),
        version: 1,
        data: dump
    });
}
