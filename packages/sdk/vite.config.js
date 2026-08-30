import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        lib: {
            entry: 'src/index.js',
            name: 'Chalkboard',
            formats: ['iife', 'es'],
            fileName: format => (format === 'iife' ? 'sdk.iife.js' : 'sdk.mjs')
        },
        rollupOptions: {
            output: {
                // The default export IS the global: window.Chalkboard(...).
                exports: 'default'
            }
        }
    },
    test: {
        environment: 'happy-dom',
        environmentOptions: {
            happyDOM: {
                // Overlay/embed tests create iframes pointing at example
                // origins; don't try to actually load them.
                settings: { disableIframePageLoading: true }
            }
        },
        include: ['test/**/*.spec.js']
    }
});
