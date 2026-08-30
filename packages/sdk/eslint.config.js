import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                location: 'readonly',
                fetch: 'readonly',
                Headers: 'readonly',
                Blob: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                HTMLElement: 'readonly',
                HTMLIFrameElement: 'readonly',
                Element: 'readonly',
                ShadowRoot: 'readonly',
                KeyboardEvent: 'readonly',
                MessageEvent: 'readonly',
                CustomEvent: 'readonly',
                IntersectionObserver: 'readonly',
                sessionStorage: 'readonly',
                crypto: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly'
            }
        },
        rules: {
            'no-console': 'error',
            eqeqeq: 'error',
            complexity: ['error', 13]
        }
    },
    {
        ignores: ['dist/**', 'coverage/**', 'node_modules/**']
    }
];
