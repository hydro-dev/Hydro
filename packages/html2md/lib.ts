import 'hydrooj';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';

const turndownService = new TurndownService();

export function convertHTML(html: string) {
    const DOM = new JSDOM(html);
    const eles = DOM.window.document.querySelectorAll('span.katex-mathml');
    eles.forEach((ele) => {
        const MathML = ele.innerHTML;
        ele.parentElement.replaceWith(MathML);
    });
    return turndownService.turndown(DOM.serialize());
}

global.Hydro.lib.convertHTML = convertHTML;
