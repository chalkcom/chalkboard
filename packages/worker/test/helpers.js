/** Shared test utilities for the worker suite. */

import { env, createExecutionContext } from 'cloudflare:test';
import { signJwt } from '@chalkcom/core/jwt';
import { createFeedbackApp } from '../src/index.js';

export const BASE = 'https://feedback.example.com';
export const SECRET = 'test-jwt-secret';

/**
 * Split a migration file into statements. A plain split on `;` breaks the
 * FTS triggers, whose bodies are `BEGIN … END;` blocks — so `;` only
 * terminates a statement at trigger-depth 0.
 * @param {string} sql
 * @returns {string[]}
 */
export function splitSqlStatements(sql) {
    /** @type {string[]} */
    const statements = [];
    let buffer = '';
    let depth = 0;
    const tokens = sql.split(/(;)/);
    for (const token of tokens) {
        if (token === ';') {
            if (depth === 0) {
                if (buffer.trim()) statements.push(buffer.trim());
                buffer = '';
            } else {
                buffer += token;
            }
            continue;
        }
        depth += (token.match(/\bBEGIN\b/gi) || []).length;
        depth -= (token.match(/\bEND\b/gi) || []).length;
        if (depth < 0) depth = 0;
        buffer += token;
    }
    if (buffer.trim()) statements.push(buffer.trim());
    return statements;
}

/**
 * Apply every migration (from the TEST_MIGRATIONS binding) to the test DB.
 * @param {{ DB: any, TEST_MIGRATIONS: Array<{ name: string, sql: string }> }} testEnv
 */
export async function applyMigrations(testEnv = env) {
    for (const migration of testEnv.TEST_MIGRATIONS) {
        for (const statement of splitSqlStatements(migration.sql)) {
            await testEnv.DB.prepare(statement).run();
        }
    }
}

/**
 * @param {Record<string, unknown>} [claims]
 * @returns {Promise<string>} a member JWT for user `sub`
 */
export function memberJwt(claims = {}) {
    return signJwt(
        {
            sub: 'user-1',
            email: 'member@example.com',
            name: 'Member One',
            exp: Math.floor(Date.now() / 1000) + 3600,
            ...claims
        },
        SECRET
    );
}

/**
 * @param {Record<string, unknown>} [claims]
 * @returns {Promise<string>} a staff JWT
 */
export function staffJwt(claims = {}) {
    return memberJwt({
        sub: 'staff-1',
        email: 'staff@example.com',
        name: 'Staff One',
        role: 'staff',
        ...claims
    });
}

/**
 * Build an app instance and a request helper bound to it.
 * @param {Record<string, unknown>} [options] createFeedbackApp options
 * @param {Record<string, unknown>} [envOverrides] extra/replacement env
 *   bindings for this app (e.g. a fake ANTHROPIC_API_KEY)
 */
export function makeApp(options = {}, envOverrides = {}) {
    const app = createFeedbackApp(options);
    const appEnv = { ...env, ...envOverrides };
    /**
     * @param {string} path
     * @param {{ method?: string, jwt?: string, body?: unknown, headers?: Record<string, string> }} [init]
     * @returns {Promise<Response>}
     */
    async function call(
        path,
        { method = 'GET', jwt, body, headers = {} } = {}
    ) {
        const requestHeaders = new Headers(headers);
        if (jwt) requestHeaders.set('Authorization', `Bearer ${jwt}`);
        if (body !== undefined) {
            requestHeaders.set('Content-Type', 'application/json');
        }
        const request = new Request(BASE + path, {
            method,
            headers: requestHeaders,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return app.fetch(request, appEnv, createExecutionContext());
    }
    return { app, call };
}

/**
 * Create a post as `jwt` and return the response body's post.
 * @param {(path: string, init?: object) => Promise<Response>} call
 * @param {string} jwt
 * @param {Record<string, unknown>} [fields]
 */
export async function createPostAs(call, jwt, fields = {}) {
    const res = await call('/api/v1/posts', {
        method: 'POST',
        jwt,
        body: { title: 'Test post', ...fields }
    });
    if (res.status !== 201) {
        throw new Error(`createPost failed: ${res.status}`);
    }
    return (await res.json()).post;
}
