import 'hydrooj';
import { convertHTML } from '@hydrooj/html2md/lib';

describe('html2md', () => {
    const Katex1 = `\
<span class="katex">
    <span class="katex-mathml">nn</span>
    <span class="katex-html">
        <span class="strut"></span>
        <span class="strut bottom" style="vertical-align:0em;"></span>
        <span class="base textstyle uncramped">
            <span class="mord mathit">n</span>
        </span>
    </span>
</span>`;
    const Katex2 = `\
<span class="katex">
    <span class="katex-mathml">E={1,2,..,n}E=\\{1,2,..,n\\}</span>
    <span class="katex-html">
        <span class="strut"></span>
        <span class="strut bottom" style="vertical-align:-0.25em;"></span>
        <span class="base textstyle uncramped">
            <span class="mord mathit">E</span>
            <span class="mrel">=</span>
            <span class="mopen">{</span>
            <span class="mord mathrm">1</span>
            <span class="mpunct">,</span>
            <span class="mord mathrm">2</span>
            <span class="mpunct">,</span>
            <span class="mord mathrm">.</span>
            <span class="mord mathrm">.</span>
            <span class="mpunct">,</span>
            <span class="mord mathit">n</span>
            <span class="mclose">}</span>
        </span>
    </span>
</span>`;

    test('convertHTML', () => {
        expect(convertHTML('<h1>Test</h1><p>test</p>')).toStrictEqual('# Test\n\ntest');
        expect(convertHTML(Katex1)).toStrictEqual('$n$');
        expect(convertHTML(Katex2)).toStrictEqual('$E={1,2,..,n}$');
    });
});
