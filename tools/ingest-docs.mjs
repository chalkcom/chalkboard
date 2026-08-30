#!/usr/bin/env node
/**
 * Ingest a documentation directory into a Chalkboard knowledge base.
 *
 *   node tools/ingest-docs.mjs \
 *     --dir ../storekit-docs/src/content \
 *     --base-url https://docs.storekit.com \
 *     --target https://feedback.storekit.com \
 *     --token $IMPORT_TOKEN \
 *     [--source docs] [--dry-run]
 *
 * Walks .md/.mdx files, strips frontmatter and (crudely) JSX, chunks on
 * headings at ~2500-char targets with a small overlap, derives each
 * chunk's url from --base-url plus the file's relative path, and POSTs
 * batches of ≤100 chunks to <target>/api/v1/knowledge. Re-running is
 * idempotent (stable ids); use DELETE /api/v1/knowledge?source=… (staff)
 * to clear a source completely before a restructure.
 *
 * Node >= 22, no dependencies.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const CHUNK_TARGET = 2500;
const CHUNK_OVERLAP = 200;
const MAX_CHUNK = 4000;
const BATCH_SIZE = 100;

function parseArgs(argv) {
    const args = { source: 'docs', dryRun: false };
    for (let i = 2; i < argv.length; i += 1) {
        const flag = argv[i];
        if (flag === '--dry-run') args.dryRun = true;
        else if (flag === '--dir') args.dir = argv[++i];
        else if (flag === '--base-url') args.baseUrl = argv[++i];
        else if (flag === '--target') args.target = argv[++i];
        else if (flag === '--token') args.token = argv[++i];
        else if (flag === '--source') args.source = argv[++i];
        else {
            console.error(`Unknown flag: ${flag}`);
            process.exit(1);
        }
    }
    if (!args.dir || (!args.dryRun && (!args.target || !args.token))) {
        console.error(
            'Usage: node tools/ingest-docs.mjs --dir <path> --target <url> ' +
                '--token <IMPORT_TOKEN> [--base-url <url>] [--source docs] ' +
                '[--dry-run]'
        );
        process.exit(1);
    }
    return args;
}

/** @param {string} dir */
function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.') || entry === 'node_modules') continue;
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            yield* walk(path);
        } else if (/\.mdx?$/.test(entry)) {
            yield path;
        }
    }
}

/**
 * Strip frontmatter, imports/exports and (crudely) JSX tags — enough to
 * index MDX docs like StoreKit's without an MDX parser.
 * @param {string} raw
 */
function cleanMarkdown(raw) {
    return raw
        .replace(/^---\n[\s\S]*?\n---\n/, '')
        .replace(/^(import|export)\s.*$/gm, '')
        .replace(/<\/?[A-Z][\w.]*[^>]*>/g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Split on headings, then pack sections into ~CHUNK_TARGET-char chunks
 * with a small overlap so heading context carries across boundaries.
 * @param {string} text
 * @returns {Array<{ title: string | null, chunk: string }>}
 */
function chunkDocument(text) {
    const sections = text.split(/^(?=#{1,3} )/m).filter(s => s.trim());
    const chunks = [];
    let buffer = '';
    let title = null;

    const flush = () => {
        const chunk = buffer.trim().slice(0, MAX_CHUNK);
        if (chunk) chunks.push({ title, chunk });
        buffer = buffer.slice(-CHUNK_OVERLAP);
    };

    for (const section of sections) {
        const heading = section.match(/^#{1,3} (.+)$/m)?.[1]?.trim() ?? null;
        if (buffer.length + section.length > CHUNK_TARGET && buffer.trim()) {
            flush();
        }
        if (!buffer.trim()) title = heading ?? title;
        buffer += section;
        // Very long single sections still get split.
        while (buffer.length > CHUNK_TARGET * 1.5) {
            const head = buffer.slice(0, CHUNK_TARGET);
            chunks.push({ title, chunk: head.trim() });
            buffer = buffer.slice(CHUNK_TARGET - CHUNK_OVERLAP);
        }
    }
    flush();
    return chunks;
}

/** @param {string} relPath */
function docUrl(baseUrl, relPath) {
    if (!baseUrl) return undefined;
    const slug = relPath
        .split(sep)
        .join('/')
        .replace(/\.mdx?$/, '')
        .replace(/\/index$/, '');
    return `${baseUrl.replace(/\/$/, '')}/${slug}`;
}

async function main() {
    const args = parseArgs(process.argv);
    const items = [];
    let files = 0;
    for (const path of walk(args.dir)) {
        files += 1;
        const relPath = relative(args.dir, path);
        const url = docUrl(args.baseUrl, relPath);
        const text = cleanMarkdown(readFileSync(path, 'utf8'));
        if (!text) continue;
        chunkDocument(text).forEach((piece, index) => {
            items.push({
                // Stable per document+chunk, so re-ingest upserts instead
                // of duplicating regardless of batch boundaries.
                id: createHash('sha256')
                    .update(`${args.source}\n${relPath}\n${index}`)
                    .digest('hex')
                    .slice(0, 16),
                source: args.source,
                url,
                title: piece.title ?? relPath,
                chunk: piece.chunk
            });
        });
    }
    console.log(`${files} files → ${items.length} chunks`);
    if (args.dryRun) {
        for (const item of items.slice(0, 5)) {
            console.log(`- [${item.title}] ${item.url ?? ''}`);
        }
        return;
    }

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        const response = await fetch(`${args.target}/api/v1/knowledge`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${args.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ items: batch })
        });
        if (!response.ok) {
            console.error(`Batch failed: HTTP ${response.status}`);
            process.exit(1);
        }
        const result = await response.json();
        console.log(
            `Batch ${i / BATCH_SIZE + 1}: wrote ${result.written}, ` +
                `rejected ${result.rejected}`
        );
    }
    console.log('Done.');
}

await main();
