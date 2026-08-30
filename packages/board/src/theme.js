/** Config-driven theming: server theme object → CSS custom properties. */

const THEME_KEYS = {
    brand: '--cb-brand',
    brandContrast: '--cb-brand-contrast',
    surface: '--cb-surface',
    surfaceRaised: '--cb-surface-raised',
    ink: '--cb-ink',
    muted: '--cb-muted',
    edge: '--cb-edge',
    radius: '--cb-radius',
    font: '--cb-font'
};

/**
 * Apply a theme object (from /api/v1/config or embed init) to the root
 * element as inline CSS variables. Unknown keys are ignored.
 * @param {Record<string, string> | null | undefined} theme
 */
export function applyTheme(theme) {
    if (!theme) return;
    const root = document.documentElement;
    for (const [key, cssVar] of Object.entries(THEME_KEYS)) {
        const value = theme[key];
        if (typeof value === 'string' && value.length < 200) {
            root.style.setProperty(cssVar, value);
        }
    }
}
