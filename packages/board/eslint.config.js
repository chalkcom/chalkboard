import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';

export default [
    js.configs.recommended,
    ...pluginVue.configs['flat/recommended'],
    {
        files: ['**/*.{js,vue}'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                fetch: 'readonly',
                Headers: 'readonly',
                Request: 'readonly',
                Response: 'readonly',
                MessageEvent: 'readonly',
                console: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                ResizeObserver: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly'
            }
        },
        rules: {
            eqeqeq: 'error',
            complexity: ['error', 13],
            'vue/html-indent': 'off',
            'vue/max-attributes-per-line': 'off',
            'vue/singleline-html-element-content-newline': 'off',
            'vue/html-closing-bracket-newline': 'off',
            'vue/html-self-closing': 'off',
            // Prettier owns template formatting; these fight with it.
            'vue/multiline-html-element-content-newline': 'off',
            'vue/attributes-order': 'off'
        }
    },
    {
        ignores: ['dist/**', 'coverage/**', 'node_modules/**']
    }
];
