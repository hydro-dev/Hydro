import AnsiUp from 'ansi_up';
import moment from 'moment-timezone';
import { ObjectID } from 'mongodb';
import { formatSeconds, size } from '@hydrooj/utils/lib/utils';

export { size, formatSeconds } from '@hydrooj/utils/lib/utils';

const AU = new AnsiUp();

export function ansiToHtml(str: string) {
    return AU.ansi_to_html(str);
}

export function datetimeSpan(dt: Date | ObjectID, relative = true, format = 'YYYY-M-D H:mm:ss', tz = 'Asia/Shanghai') {
    if (!dt) return 'DATETIME_SPAN_ERROR';
    if (dt instanceof ObjectID) dt = new Date(dt.generationTime * 1000);
    else if (typeof dt === 'string' && ObjectID.isValid(dt)) dt = new Date(new ObjectID(dt).generationTime * 1000);
    else if (typeof dt === 'number' || typeof dt === 'string') dt = new Date(dt);
    return '<span class="time{0}" data-timestamp="{1}">{2}</span>'.format(
        relative ? ' relative' : '',
        dt.getTime() / 1000,
        moment(dt).tz(tz).format(format),
    );
}

export function* paginate(page: number, numPages: number) {
    const radius = 5;
    let first: number;
    let last: number;
    if (page > 1) {
        if (page > 2) yield ['first', 1];
        yield ['previous', page - 1];
    }
    if (page <= radius) [first, last] = [1, Math.min(1 + radius * 2, numPages)];
    else if (page >= numPages - radius) {
        [first, last] = [Math.max(1, numPages - radius * 2), numPages];
    } else {
        [first, last] = [page - radius, page + radius];
    }
    if (first > 1) yield ['ellipsis', 0];
    for (let page0 = first; page0 < last + 1; page0++) {
        if (page0 !== page) yield ['page', page0];
        else yield ['current', page];
    }
    if (last < numPages) yield ['ellipsis', 0];
    if (page < numPages) {
        yield ['next', page + 1];
        if (page < numPages - 1) yield ['last', numPages];
    }
}

global.Hydro.lib.misc = {
    datetimeSpan, paginate, size, formatSeconds, ansiToHtml,
};
