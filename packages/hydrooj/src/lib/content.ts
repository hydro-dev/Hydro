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
