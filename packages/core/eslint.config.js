import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                crypto: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
                atob: 'readonly',
                btoa: 'readonly'
            }
        },
        rules: {
            'no-console': 'error',
            eqeqeq: 'error',
            complexity: ['error', 13]
        }
    },
    {
        ignores: ['coverage/**', 'node_modules/**']
    }
];
