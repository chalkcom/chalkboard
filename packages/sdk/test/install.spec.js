import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Installation behavior needs a fresh module registry per test (the entry
 * self-installs at import time), so every test re-imports the SDK.
 * Element behavior lives in elements.spec.js, which — deliberately —
 * imports the SDK exactly once: customElements.define is permanent per
 * window, so classes must keep referring to one live module registry.
 */
async function importSdk() {
    const mod = await import('../src/index.js');
    return mod.default;
}

beforeEach(() => {
    vi.resetModules();
    delete window.Chalkboard;
});

describe('installation', () => {
    it('installs the command function and registers the custom elements', async () => {
        const Chalkboard = await importSdk();
        expect(typeof window.Chalkboard).toBe('function');
        expect(window.Chalkboard).toBe(Chalkboard);
        expect(window.customElements.get('chalk-hint')).toBeTruthy();
        expect(window.customElements.get('chalk-topic')).toBeTruthy();
        expect(window.customElements.get('chalk-post')).toBeTruthy();
    });

    it('drains a pre-load command queue', async () => {
        const stub = function () {
            (stub.q = stub.q || []).push(arguments);
        };
        stub('config', { url: 'https://queued.example.com' });
        window.Chalkboard = stub;

        await importSdk();
        const { state } = await import('../src/api.js');
        expect(state.url).toBe('https://queued.example.com');
        expect(typeof window.Chalkboard).toBe('function');
        expect(window.Chalkboard.q).toBeUndefined();
    });

    it('ignores unknown commands', async () => {
        const Chalkboard = await importSdk();
        expect(Chalkboard('definitely-not-a-command', {})).toBeUndefined();
    });
});
