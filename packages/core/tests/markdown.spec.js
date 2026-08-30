import { describe, expect, it } from 'vitest';
import { escapeHtml, renderMarkdown } from '@chalkcom/core/markdown';

describe('escapeHtml', () => {
    it('escapes all HTML-significant characters', () => {
        expect(escapeHtml(`<a href="x" b='y'>&</a>`)).toBe(
            '&lt;a href=&quot;x&quot; b=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
        );
    });
});

describe('renderMarkdown formatting', () => {
    it('wraps text in paragraphs and breaks single newlines', () => {
        expect(renderMarkdown('one\ntwo\n\nthree')).toBe(
            '<p>one<br>two</p>\n<p>three</p>'
        );
    });

    it('renders bold, italic and inline code', () => {
        expect(renderMarkdown('**b** and *i* and `c`')).toBe(
            '<p><strong>b</strong> and <em>i</em> and <code>c</code></p>'
        );
    });

    it('leaves markdown inside code spans verbatim', () => {
        expect(renderMarkdown('`**not bold**`')).toBe(
            '<p><code>**not bold**</code></p>'
        );
    });

    it('does not confuse digits in text with code placeholders', () => {
        expect(renderMarkdown('I have 3 apples and `code`')).toBe(
            '<p>I have 3 apples and <code>code</code></p>'
        );
    });

    it('renders fenced code blocks', () => {
        expect(renderMarkdown('```\nconst a = 1;\n<b>\n```')).toBe(
            '<pre><code>const a = 1;\n&lt;b&gt;</code></pre>'
        );
    });

    it('closes an unterminated fence at end of input', () => {
        expect(renderMarkdown('```\nabc')).toBe('<pre><code>abc</code></pre>');
    });

    it('renders dash lists', () => {
        expect(renderMarkdown('- one\n- **two**')).toBe(
            '<ul><li>one</li><li><strong>two</strong></li></ul>'
        );
    });

    it('renders http and https links', () => {
        expect(renderMarkdown('[site](https://example.com/a?b=1)')).toBe(
            '<p><a href="https://example.com/a?b=1" rel="nofollow noopener noreferrer">site</a></p>'
        );
        expect(renderMarkdown('[site](http://example.com)')).toContain(
            '<a href="http://example.com"'
        );
    });

    it('returns empty string for empty or non-string input', () => {
        expect(renderMarkdown('')).toBe('');
        expect(renderMarkdown(undefined)).toBe('');
        expect(renderMarkdown(null)).toBe('');
    });
});

describe('renderMarkdown XSS safety', () => {
    /**
     * Strip the tags the renderer itself is allowed to emit; anything that
     * still looks like markup afterwards came from unescaped user input.
     * The renderer only puts escaped text (no raw `"`) inside href.
     * @param {string} html
     * @returns {string}
     */
    const stripAllowedTags = html =>
        html
            .replace(/<a href="[^"]*" rel="nofollow noopener noreferrer">/g, '')
            .replace(/<\/?(p|br|strong|em|code|pre|ul|li|a)>/g, '');

    const hostile = [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '"><svg/onload=alert(1)>',
        '<iframe src="javascript:alert(1)"></iframe>',
        '</p><script>alert(1)</script><p>',
        '&lt;script&gt;alert(1)&lt;/script&gt;',
        '`</code><script>alert(1)</script>`',
        '**<b onmouseover=alert(1)>x</b>**',
        '- <li onclick=alert(1)>x'
    ];

    it.each(hostile)('neutralises %s', input => {
        const rest = stripAllowedTags(renderMarkdown(input));
        expect(rest).not.toMatch(/[<>"]/);
    });

    it('rejects javascript: and data: link schemes', () => {
        expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a ');
        expect(
            renderMarkdown('[x](data:text/html,<script>alert(1)</script>)')
        ).not.toContain('<a ');
        expect(renderMarkdown('[x](vbscript:msgbox)')).not.toContain('<a ');
    });

    it('escapes quotes inside link URLs so they cannot close the attribute', () => {
        const html = renderMarkdown(
            '[x](https://e.com/"onmouseover="alert(1))'
        );
        // The input quotes must arrive escaped; a raw `"onmouseover` would
        // mean the attacker broke out of the href attribute.
        expect(html).toContain('&quot;onmouseover=&quot;');
        expect(html).not.toContain('"onmouseover');
        expect(stripAllowedTags(html)).not.toMatch(/[<>"]/);
    });

    it('never emits raw angle brackets from input text', () => {
        const html = renderMarkdown('a < b > c & "d"');
        expect(html).toBe('<p>a &lt; b &gt; c &amp; &quot;d&quot;</p>');
    });

    it('keeps hostile fenced content inert', () => {
        const html = renderMarkdown('```\n<script>alert(1)</script>\n```');
        expect(html).toBe(
            '<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>'
        );
    });
});
