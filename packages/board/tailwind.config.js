/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{vue,js}'],
    theme: {
        extend: {
            colors: {
                brand: 'var(--cb-brand)',
                'brand-contrast': 'var(--cb-brand-contrast)',
                surface: 'var(--cb-surface)',
                'surface-raised': 'var(--cb-surface-raised)',
                ink: 'var(--cb-ink)',
                muted: 'var(--cb-muted)',
                edge: 'var(--cb-edge)'
            },
            borderRadius: {
                cb: 'var(--cb-radius)'
            }
        }
    },
    plugins: []
};
