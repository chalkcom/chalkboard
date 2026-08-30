/**
 * Minimal HS256 JWT + compact HMAC session values, built on WebCrypto only.
 * Works in Cloudflare Workers, browsers and Node >= 22 without dependencies.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function base64urlEncode(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary)
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '');
}

/**
 * @param {string} value
 * @returns {Uint8Array | null} null when the input is not valid base64url
 */
export function base64urlDecode(value) {
    if (typeof value !== 'string' || /[^A-Za-z0-9_-]/.test(value)) return null;
    const padded =
        value.replaceAll('-', '+').replaceAll('_', '/') +
        '='.repeat((4 - (value.length % 4)) % 4);
    try {
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch {
        return null;
    }
}

/**
 * @param {string} secret
 * @returns {Promise<CryptoKey>}
 */
async function hmacKey(secret) {
    return crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    );
}

/**
 * @param {string} data
 * @param {string} secret
 * @returns {Promise<string>} base64url HMAC-SHA256 signature
 */
async function hmacSign(data, secret) {
    const key = await hmacKey(secret);
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return base64urlEncode(new Uint8Array(sig));
}

/**
 * @param {string} data
 * @param {string} signature base64url
 * @param {string} secret
 * @returns {Promise<boolean>}
 */
async function hmacVerify(data, signature, secret) {
    const sig = base64urlDecode(signature);
    if (!sig) return false;
    const key = await hmacKey(secret);
    return crypto.subtle.verify(
        'HMAC',
        key,
        /** @type {BufferSource} */ (sig),
        encoder.encode(data)
    );
}

/**
 * Sign an HS256 JWT.
 * @param {Record<string, unknown>} claims
 * @param {string} secret
 * @returns {Promise<string>}
 */
export async function signJwt(claims, secret) {
    const header = base64urlEncode(
        encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    );
    const payload = base64urlEncode(encoder.encode(JSON.stringify(claims)));
    const signingInput = `${header}.${payload}`;
    const signature = await hmacSign(signingInput, secret);
    return `${signingInput}.${signature}`;
}

/**
 * @param {string} b64
 * @returns {unknown} decoded JSON, or undefined on any failure
 */
function decodeJsonSegment(b64) {
    const bytes = base64urlDecode(b64);
    if (!bytes) return undefined;
    try {
        return JSON.parse(decoder.decode(bytes));
    } catch {
        return undefined;
    }
}

/**
 * @param {unknown} claims
 * @param {number} clockSkewSec
 * @param {boolean} requireExp
 * @returns {claims is Record<string, unknown>}
 */
function claimsAreValid(claims, clockSkewSec, requireExp) {
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
        return false;
    }
    const { sub, exp } = /** @type {Record<string, unknown>} */ (claims);
    if (typeof sub !== 'string' || sub.length === 0) return false;
    if (exp === undefined) return !requireExp;
    if (typeof exp !== 'number') return false;
    return exp + clockSkewSec >= Math.floor(Date.now() / 1000);
}

/**
 * Verify an HS256 JWT and return its claims, or null on any failure.
 * Requires `sub` and, by default, a numeric `exp` (enforced with clock
 * skew) — pass `requireExp: false` to accept non-expiring tokens.
 * @param {string} token
 * @param {string} secret
 * @param {{ clockSkewSec?: number, requireExp?: boolean }} [options]
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function verifyJwt(
    token,
    secret,
    { clockSkewSec = 60, requireExp = true } = {}
) {
    if (typeof token !== 'string' || typeof secret !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signature] = parts;
    const header = decodeJsonSegment(headerB64);
    const claims = decodeJsonSegment(payloadB64);
    if (!header || /** @type {any} */ (header).alg !== 'HS256') return null;
    if (!claimsAreValid(claims, clockSkewSec, requireExp)) return null;
    const ok = await hmacVerify(
        `${headerB64}.${payloadB64}`,
        signature,
        secret
    );
    return ok ? /** @type {Record<string, unknown>} */ (claims) : null;
}

/**
 * Sign a compact session value for a cookie: base64url(JSON).signature.
 * Payload is expected to carry `{ uid, exp }` (exp in unix seconds).
 * @param {{ uid: string, exp: number } & Record<string, unknown>} payload
 * @param {string} secret
 * @returns {Promise<string>}
 */
export async function signSession(payload, secret) {
    const body = base64urlEncode(encoder.encode(JSON.stringify(payload)));
    const signature = await hmacSign(body, secret);
    return `${body}.${signature}`;
}

/**
 * Verify a compact session value; returns the payload or null. Enforces
 * `exp` and requires `uid`.
 * @param {string} value
 * @param {string} secret
 * @param {{ clockSkewSec?: number }} [options]
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function verifySession(value, secret, { clockSkewSec = 60 } = {}) {
    if (typeof value !== 'string' || typeof secret !== 'string') return null;
    const parts = value.split('.');
    if (parts.length !== 2) return null;
    const [body, signature] = parts;
    if (!(await hmacVerify(body, signature, secret))) return null;
    const bytes = base64urlDecode(body);
    if (!bytes) return null;
    let payload;
    try {
        payload = JSON.parse(decoder.decode(bytes));
    } catch {
        return null;
    }
    if (!payload || typeof payload.uid !== 'string') return null;
    if (typeof payload.exp !== 'number') return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp + clockSkewSec < now) return null;
    return payload;
}
