import 'hydrooj';
import TurndownService from 'turndown';

const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
});

export function convertHTML(html: string) {
    return turndownService.turndown(html);
}

global.Hydro.lib.convertHTML = convertHTML;
