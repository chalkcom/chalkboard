/**
 * Safe-subset markdown renderer. All input is HTML-escaped before any
 * formatting is applied, so the output can only contain tags this module
 * emits itself: p, br, strong, em, code, pre, ul, li and a (http/https only).
 */

/**
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/**
 * Inline formatting on already-escaped text: code spans first (their content
 * is left verbatim), then links, bold and italic.
 * @param {string} escaped
 * @returns {string}
 */
function renderInline(escaped) {
    /** @type {string[]} */
    const codeSpans = [];
    // NUL is stripped from the input first, so it is a safe placeholder
    // marker that user text can never collide with.
    let text = escaped
        .replaceAll('\u0000', '')
        .replace(/`([^`\n]+)`/g, (_, code) => {
            codeSpans.push(`<code>${code}</code>`);
            return `\u0000${codeSpans.length - 1}\u0000`;
        });
    text = text.replace(
        /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (_, label, href) =>
            `<a href="${href}" rel="nofollow noopener noreferrer">${label}</a>`
    );
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    // Restore code spans: split on NUL leaves [text, index, text, …].
    return text
        .split('\u0000')
        .map((part, i) => (i % 2 === 1 ? codeSpans[Number(part)] : part))
        .join('');
}

/**
 * @param {string[]} lines escaped lines of one non-code block
 * @returns {string}
 */
function renderBlock(lines) {
    if (lines.every(line => /^-\s+/.test(line))) {
        const items = lines
            .map(line => `<li>${renderInline(line.replace(/^-\s+/, ''))}</li>`)
            .join('');
        return `<ul>${items}</ul>`;
    }
    return `<p>${lines.map(renderInline).join('<br>')}</p>`;
}

/**
 * Render a safe HTML fragment from markdown-ish text. Supports paragraphs,
 * line breaks, **bold**, *italic*, `code`, fenced code blocks, `-` lists and
 * [text](http(s)://…) links. Anything else is rendered as plain text.
 * @param {string} markdown
 * @returns {string}
 */
export function renderMarkdown(markdown) {
    if (typeof markdown !== 'string' || markdown.length === 0) return '';
    const out = [];
    const lines = markdown.replaceAll('\r\n', '\n').split('\n');
    /** @type {string[]} */
    let block = [];
    /** @type {string[] | null} */
    let fence = null;

    const flush = () => {
        if (block.length > 0) out.push(renderBlock(block));
        block = [];
    };

    for (const raw of lines) {
        if (fence) {
            if (/^```\s*$/.test(raw)) {
                out.push(`<pre><code>${fence.join('\n')}</code></pre>`);
                fence = null;
            } else {
                fence.push(escapeHtml(raw));
            }
            continue;
        }
        if (/^```/.test(raw)) {
            flush();
            fence = [];
            continue;
        }
        if (raw.trim() === '') {
            flush();
            continue;
        }
        block.push(escapeHtml(raw));
    }
    if (fence) out.push(`<pre><code>${fence.join('\n')}</code></pre>`);
    flush();
    return out.join('\n');
}
