/**
 * KV-backed fixed-window rate limiter. Best-effort (KV reads/writes are not
 * atomic) which is fine for abuse damping; fails open when the RATE binding
 * is missing so local dev works without KV.
 */

/**
 * @param {{ RATE?: KVNamespace }} env
 * @param {string} route short route name used in the key
 * @param {string} subject user id or client IP
 * @param {{ limit: number, windowSec: number }} options
 * @returns {Promise<boolean>} true when the request is allowed
 */
export async function checkRateLimit(env, route, subject, options) {
    const kv = env.RATE;
    if (!kv) return true;
    const windowStart = Math.floor(Date.now() / 1000 / options.windowSec);
    const key = `rate:${route}:${subject}:${windowStart}`;
    const current = Number((await kv.get(key)) || 0);
    if (current >= options.limit) return false;
    await kv.put(key, String(current + 1), {
        expirationTtl: Math.max(60, options.windowSec)
    });
    return true;
}

/** @typedef {import('@cloudflare/workers-types').KVNamespace} KVNamespace */
