const md5 = require('./md5');

function gravatar(email, s = 32) {
    return `//gravatar.loli.net/avatar/${md5((email || '').toString().trim().toLowerCase())}?d=mm&s=${s}`;
}

function datetimeSpan(dt, relative = true, format = '%Y-%m-%d %H:%M:%S') {
    if (!dt) return 'DATETIME_SPAN_ERROR';
    if (dt.generationTime) dt = new Date(dt.generationTime * 1000);
    else if (typeof dt === 'number' || typeof dt === 'string') dt = new Date(dt);
    return '<span class="time{0}" data-timestamp="{1}">{2}</span>'.format(
        relative ? ' relative' : '',
        dt.getTime() / 1000,
        dt.format(format),
    );
}

function* paginate(page, numPages) {
    const radius = 2; let first; let
        last;
    if (page > 1) {
        yield ['first', 1];
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
    if (page < numPages) yield ['next', page + 1];
    yield ['last', numPages];
}

function size(s, base = 1) {
    s *= base;
    const unit = 1024;
    const unitNames = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    for (const unitName of unitNames) {
        if (s < unit) return '{0} {1}'.format(Math.round(s), unitName);
        s /= unit;
    }
    return '{0} {1}'.format(Math.round(s * unit), unitNames[unitNames.length - 1]);
}

global.Hydro.lib.misc = module.exports = {
    gravatar, datetimeSpan, paginate, size,
};
