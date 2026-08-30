import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [vue()],
    server: {
        proxy: {
            // Local dev against `wrangler dev` running the worker.
            '/api': 'http://localhost:8787',
            '/auth': 'http://localhost:8787'
        }
    },
    test: {
        environment: 'happy-dom',
        include: ['tests/**/*.spec.js']
    }
});
