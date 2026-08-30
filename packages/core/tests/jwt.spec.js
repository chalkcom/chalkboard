import { describe, expect, it } from 'vitest';
import {
    base64urlDecode,
    base64urlEncode,
    signJwt,
    signSession,
    verifyJwt,
    verifySession
} from '@chalkcom/core/jwt';

const SECRET = 'test-secret';
const now = () => Math.floor(Date.now() / 1000);

describe('base64url helpers', () => {
    it('round-trips arbitrary bytes', () => {
        const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
        const encoded = base64urlEncode(bytes);
        expect(encoded).not.toMatch(/[+/=]/);
        expect(Array.from(base64urlDecode(encoded))).toEqual(Array.from(bytes));
    });

    it('rejects non-base64url input', () => {
        expect(base64urlDecode('a+b')).toBeNull();
        expect(base64urlDecode('a b')).toBeNull();
    });
});

describe('signJwt / verifyJwt', () => {
    it('round-trips claims', async () => {
        const claims = { sub: 'u1', email: 'a@b.c', exp: now() + 3600 };
        const token = await signJwt(claims, SECRET);
        expect(await verifyJwt(token, SECRET)).toEqual(claims);
    });

    it('rejects a bad signature', async () => {
        const token = await signJwt({ sub: 'u1' }, SECRET);
        expect(await verifyJwt(token, 'other-secret')).toBeNull();
        expect(await verifyJwt(token.slice(0, -2) + 'xx', SECRET)).toBeNull();
    });

    it('rejects tampered payloads', async () => {
        const token = await signJwt({ sub: 'u1', role: 'member' }, SECRET);
        const [h, , s] = token.split('.');
        const forged = base64urlEncode(
            new TextEncoder().encode(
                JSON.stringify({ sub: 'u1', role: 'staff' })
            )
        );
        expect(await verifyJwt(`${h}.${forged}.${s}`, SECRET)).toBeNull();
    });

    it('rejects expired tokens beyond clock skew', async () => {
        const token = await signJwt({ sub: 'u1', exp: now() - 120 }, SECRET);
        expect(await verifyJwt(token, SECRET)).toBeNull();
    });

    it('accepts tokens expired within clock skew', async () => {
        const token = await signJwt({ sub: 'u1', exp: now() - 30 }, SECRET);
        expect(await verifyJwt(token, SECRET)).not.toBeNull();
        expect(await verifyJwt(token, SECRET, { clockSkewSec: 0 })).toBeNull();
    });

    it('requires sub', async () => {
        const token = await signJwt({ email: 'a@b.c' }, SECRET);
        expect(await verifyJwt(token, SECRET)).toBeNull();
    });

    it('rejects non-HS256 headers (alg=none attack)', async () => {
        const enc = s => base64urlEncode(new TextEncoder().encode(s));
        const forged = `${enc(JSON.stringify({ alg: 'none' }))}.${enc(
            JSON.stringify({ sub: 'u1' })
        )}.`;
        expect(await verifyJwt(forged, SECRET)).toBeNull();
    });

    it('rejects garbage input without throwing', async () => {
        for (const bad of ['', 'a.b', 'a.b.c.d', 'not a token', null, 42]) {
            expect(await verifyJwt(bad, SECRET)).toBeNull();
        }
    });
});

describe('signSession / verifySession', () => {
    it('round-trips a session payload', async () => {
        const payload = { uid: 'u1', exp: now() + 3600 };
        const value = await signSession(payload, SECRET);
        expect(value.split('.')).toHaveLength(2);
        expect(await verifySession(value, SECRET)).toEqual(payload);
    });

    it('rejects a tampered or wrongly signed value', async () => {
        const value = await signSession(
            { uid: 'u1', exp: now() + 3600 },
            SECRET
        );
        expect(await verifySession(value, 'other')).toBeNull();
        const [body] = value.split('.');
        expect(await verifySession(`${body}.bogus`, SECRET)).toBeNull();
    });

    it('rejects expired sessions and missing uid', async () => {
        const expired = await signSession(
            { uid: 'u1', exp: now() - 120 },
            SECRET
        );
        expect(await verifySession(expired, SECRET)).toBeNull();
        const noUid = await signSession({ exp: now() + 3600 }, SECRET);
        expect(await verifySession(noUid, SECRET)).toBeNull();
    });

    it('rejects garbage without throwing', async () => {
        for (const bad of ['', 'x', 'a.b.c', null]) {
            expect(await verifySession(bad, SECRET)).toBeNull();
        }
    });
});
