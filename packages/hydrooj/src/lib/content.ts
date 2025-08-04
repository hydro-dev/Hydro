export interface ProblemSource {
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
    return type === 'html'
        ? [
            ...source.description ? [`<h2>${_('Description')}</h2>`, source.description] : [],
            ...source.input ? [`<h2>${_('Input Format')}</h2>`, source.input] : [],
            ...source.output ? [`<h2>${_('Output Format')}</h2>`, source.output] : [],
            ...(source.samples || []).map((sample, i) => [
                `<pre><code class="language-input${i + 1}">`,
                sample[0],
                `</code></pre><pre><code class="language-output${i + 1}">`,
                sample[1],
                '</code></pre>',
            ].join('')),
            ...source.samplesRaw ? [source.samplesRaw] : [],
            ...source.hint ? [`<h2>${_('Hint')}</h2>`, source.hint] : [],
            ...source.source ? [`<h2>${_('Source')}</h2>`, source.source] : [],
        ].join('\n')
        : [
            ...source.description ? [`## ${_('Description')}`, '', source.description, ''] : [],
            ...source.input ? [`## ${_('Input Format')}`, '', source.input, ''] : [],
            ...source.output ? [`## ${_('Output Format')}`, '', source.output, ''] : [],
            ...(source.samples || []).flatMap((sample, i) => [
                `\`\`\`input${i + 1}`,
                sample[0],
                '```',
                `\`\`\`output${i + 1}`,
                sample[1],
                '```',
            ]),
            ...source.samplesRaw ? [source.samplesRaw] : [],
            ...source.hint ? [`## ${_('Hint')}`, '', source.hint, ''] : [],
            ...source.source ? [`## ${_('Source')}`, '', source.source, ''] : [],
        ].join('\n');
}
