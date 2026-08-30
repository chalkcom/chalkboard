/**
 * Slug and id helpers. No I/O; `uniqueSlug` takes an async existence checker
 * so callers decide how uniqueness is looked up.
 */

const MAX_SLUG_LENGTH = 80;

/**
 * Turn a title into a URL-safe slug: ascii-fold accents, lowercase, replace
 * runs of non-alphanumerics with single dashes, trim dashes, cap at 80 chars.
 * @param {string} title
 * @returns {string}
 */
export function slugify(title) {
    if (typeof title !== 'string') return '';
    const folded = title
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const slug = folded
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/-+$/, '');
    return slug;
}

/**
 * Find a slug not currently taken, appending -2, -3, … as needed.
 * @param {string} base slug produced by {@link slugify}
 * @param {(candidate: string) => Promise<boolean>} exists resolves true when
 *   the candidate is already taken
 * @returns {Promise<string>}
 */
export async function uniqueSlug(base, exists) {
    const root = base || 'post';
    if (!(await exists(root))) return root;
    for (let n = 2; ; n += 1) {
        const suffix = `-${n}`;
        const candidate =
            root.slice(0, MAX_SLUG_LENGTH - suffix.length) + suffix;
        if (!(await exists(candidate))) return candidate;
    }
}

/**
 * Generate a compact 16-character hex id.
 * @returns {string}
 */
export function newId() {
    return crypto.randomUUID().replaceAll('-', '').slice(0, 16);
}
