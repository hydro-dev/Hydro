import { ValidationError } from '../error';
import type { ProblemDoc } from '../interface';

export interface StatementEntry {
    name: string;
    lang: string;
    content?: string;
    file?: string;
    render?: any;
}

export interface RenderCtx {
    pdoc: ProblemDoc;
    tid?: string;
}

export interface CompileCtx {
    readAdditionalFile: (name: string) => Promise<Buffer>;
}

export interface Renderer {
    render(entry: StatementEntry, ctx: RenderCtx): string;
    compile?(entry: StatementEntry, ctx: CompileCtx): Promise<any>;
}

// statement name: safe filename with extension, no path separators
const NAME_RE = /^\w[\w .()-]*\.[A-Za-z0-9]{1,16}$/;

/**
 * Parse content field into statement entries.
 * - Statement list `[{name, lang, content|file}]` → entries as-is
 * - Legacy `{lang: content}` → normalized entries (name `${lang}.${md|html}`)
 * - Plain string / malformed → null (caller renders legacy)
 */
export function parseStatements(content: string, html = false): StatementEntry[] | null {
    if (!content || typeof content !== 'string') return null;
    let parsed: any;
    try {
        parsed = JSON.parse(content);
    } catch {
        return null;
    }
    if (Array.isArray(parsed)) {
        for (const value of parsed) {
            if (typeof value !== 'object' || value === null
                || typeof value.name !== 'string' || typeof value.lang !== 'string') return null;
        }
        return parsed;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;
    const entries: StatementEntry[] = [];
    for (const [lang, value] of Object.entries<any>(parsed)) {
        if (typeof value !== 'string') return null;
        entries.push({ name: `${lang}.${html ? 'html' : 'md'}`, lang, content: value });
    }
    return entries;
}

export function normalizeStatements(content: string, lang: string, html = false): StatementEntry[] {
    if (!content) return [];
    return parseStatements(content, html) ?? [{ name: `problem_${lang}.${html ? 'html' : 'md'}`, lang, content }];
}

/**
 * Parse user-submitted content (edit/create handlers).
 * Plain strings are legacy submissions → null (caller decides whether to allow).
 * A JSON array must be a valid statement list; malformed entries throw
 * instead of silently falling back to legacy rendering.
 */
export function parseSubmittedStatements(content: string, availableFiles: string[]): StatementEntry[] | null {
    if (!content || typeof content !== 'string' || !content.trim().startsWith('[')) return null;
    let parsed: any;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new ValidationError('statement.json');
    }
    if (!Array.isArray(parsed)) return null;
    const names = new Set<string>();
    for (const entry of parsed) {
        if (typeof entry !== 'object' || entry === null
            || typeof entry.name !== 'string' || typeof entry.lang !== 'string') {
            throw new ValidationError('statement.entry');
        }
        if (!NAME_RE.test(entry.name)) throw new ValidationError('statement.name', null, entry.name);
        if (names.has(entry.name)) throw new ValidationError('statement.duplicate', null, entry.name);
        names.add(entry.name);
        if (!entry.lang) throw new ValidationError('statement.lang', null, entry.name);
        const hasContent = typeof entry.content === 'string' && entry.content.length > 0;
        const hasFile = typeof entry.file === 'string' && entry.file.length > 0;
        if (!hasContent && !hasFile) throw new ValidationError('statement.empty', null, entry.name);
        if (hasFile && !availableFiles.includes(entry.file)) throw new ValidationError('statement.file', null, entry.file);
    }
    return parsed;
}

export interface ProblemSource {
    background?: string;
    description?: string;
    input?: string;
    output?: string;
    samples?: [string, string][];
    samplesRaw?: string;
    hint?: string;
    source?: string;
}

export function buildContent(source: ProblemSource, type: 'markdown' | 'html' = 'markdown', translate?: (s: string) => string) {
    const _ = translate || ((s: string) => s);
    let cnt = 0;
    // Keep it for backward compatibility, but don't add to typings
    // required by upgrade 90_91
    if (source instanceof Array) {
        return type === 'html'
            ? source.flatMap((node) => [
                node.type !== 'Plain' ? `<h2>${node.sectionTitle}</h2>` : '',
                node.type === 'Sample'
                    ? `<pre><code class="language-input${++cnt}">${node.payload[0]}</code></pre>`
                    + `<pre><code class="language-output${cnt}">${node.payload[1]}</code></pre>`
                    : '',
                node.text,
            ]).join('\n')
            : source.flatMap((node) => [
                node.type !== 'Plain' && (node.type !== 'Sample' || !cnt) ? `## ${node.sectionTitle}` : '',
                ...node.type === 'Sample'
                    ? [
                        '',
                        `\`\`\`input${++cnt}`,
                        node.payload[0],
                        '```',
                        '',
                        `\`\`\`output${cnt}`,
                        node.payload[1],
                        '```',
                        '',
                    ]
                    : [],
                '',
                node.text,
                '',
            ]).join('\n');
    }
    const line = (title: string, s: string) => s ? (type === 'html' ? [`<h2>${_(title)}</h2>`, s] : [`## ${_(title)}`, '', s, '']) : [];
    return [
        line('Background', source.background),
        line('Problem Description', source.description),
        line('Input Format', source.input),
        line('Output Format', source.output),
        type === 'html'
            ? (source.samples || []).map((sample, i) => [
                `<pre><code class="language-input${i + 1}">`,
                sample[0],
                `</code></pre><pre><code class="language-output${i + 1}">`,
                sample[1],
                '</code></pre>',
            ].join(''))
            : (source.samples || []).flatMap((sample, i) => [
                '',
                `\`\`\`input${i + 1}`,
                sample[0],
                '```',
                '',
                `\`\`\`output${i + 1}`,
                sample[1],
                '```',
                '',
            ]),
        ...source.samplesRaw ? [source.samplesRaw] : [],
        line('Hint', source.hint),
        line('Source', source.source),
    ].flat().join('\n');
}
