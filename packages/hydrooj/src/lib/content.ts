import { ContentNode } from '../interface';

export interface ProblemSource {
    description?: string,
    input?: string,
    output?: string,
    samples?: [string, string][],
    hint?: string,
    source?: string,
}

export function buildContent(source: ProblemSource | ContentNode[], type: 'markdown' | 'html' = 'markdown', translate?: Function) {
    const _ = translate || ((s: string) => s);
    if (source instanceof Array) {
        return type === 'html'
            ? source.map((node) => [
                node.type !== 'Plain' ? `<h2>${node.sectionTitle}</h2>` : '',
                node.type === 'Sample'
                    ? `<h2>${_('Sample Input')}<h2><pre>${node.payload[0]}</pre><h2>${_('Sample Output')}</h2><pre>${node.payload[1]}</pre>`
                    : '',
                node.text,
            ].join('\n')).join('\n')
            : source.map((node) => [
                node.type !== 'Plain' ? `## ${node.sectionTitle}` : '',
                ...node.type === 'Sample'
                    ? [
                        `## ${_('Sample Input')}`,
                        '```',
                        node.payload[0],
                        '```',
                        `## ${_('Sample Output')}`,
                        '```',
                        node.payload[1],
                        '```',
                    ]
                    : [],
                node.text,
            ].join('\n')).join('\n');
    }
    return type === 'html'
        ? [
            ...source.description ? [`<h2>${_('Description')}</h2>`, source.description] : [],
            ...source.input ? [`<h2>${_('Input Format')}</h2>`, source.input] : [],
            ...source.output ? [`<h2>'${_('Output Format')}</h2>`, source.output] : [],
            ...(source.samples).map((sample, i) => [
                `<h2>${_('Sample Input')} ${i + 1}</h2><pre>`,
                sample[0],
                `</pre><h2>${_('Sample Output')} ${i + 1}</h2><pre>`,
                sample[1],
                '</pre>',
            ].join('\n')),
            ...source.hint ? [`<h2>${_('Hint')}</h2>`, source.hint] : [],
            ...source.source ? [`<h2>${_('Source')}</h2>`, source.source] : [],
        ].join('\n')
        : [
            ...source.description ? [`## ${_('Description')}`, source.description] : [],
            ...source.input ? [`## ${_('Input Format')}`, source.input] : [],
            ...source.output ? [`## '${_('Output Format')}`, source.output] : [],
            ...(source.samples).map((sample, i) => [
                `## ${_('Sample Input')} ${i + 1}`,
                '```',
                sample[0],
                '```',
                `## ${_('Sample Output')} ${i + 1}`,
                '```',
                sample[1],
                '```',
            ].join('\n')),
            ...source.hint ? [`## ${_('Hint')}`, source.hint] : [],
            ...source.source ? [`## ${_('Source')}`, source.source] : [],
        ].join('\n');
}

global.Hydro.lib.buildContent = buildContent;
