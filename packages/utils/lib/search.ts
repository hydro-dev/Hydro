import type { SearchParserOptions, SearchParserResult } from 'search-query-parser';
import { parse } from 'search-query-parser';

export { parse, SearchParserOptions, SearchParserResult };

export function stringify(queryObject: SearchParserResult, options: SearchParserOptions = {}, prefix = ''): string {
    if (!Object.keys(queryObject || {}).length) return '';
    prefix ||= '';
    const toArray = (val: string | string[]) => (typeof val === 'string' ? [val] : val);
    const addQuotes = (s: string) => (s.includes(' ') ? JSON.stringify(s) : s);
    const addPrefix = (s: string) => prefix + s;
    const parts = [];
    if (queryObject.text) {
        const value = toArray(queryObject.text);
        if (value.length) parts.push(value.map(addQuotes).map(addPrefix).join(' '));
    }
    for (const range of options.ranges || []) {
        if (!queryObject[range]) continue;
        let value = queryObject[range].from;
        const to = queryObject[range].to;
        if (to) value = `${value}-${to}`;
        if (value) parts.push(addPrefix(`${range}:${value}`));
    }
    for (const keyword of options.keywords || []) {
        if (!queryObject[keyword]) continue;
        const value = toArray(queryObject[keyword]);
        if (value.length > 0) {
            parts.push(addPrefix(`${keyword}:${addQuotes(value.join(','))}`));
        }
    }
    if (Object.keys(queryObject.exclude || {}).length) {
        parts.push(stringify(queryObject.exclude, options, '-'));
    }
    return parts.join(' ');
}

export default { stringify, parse };
