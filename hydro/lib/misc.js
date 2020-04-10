const md5 = require('./md5');
exports.gravatar_url = function (email, size) {
    return `//gravatar.loli.net/avatar/${md5((email || '').toString().trim().toLowerCase())}?d=mm&s=${size}`;
};
exports.datetime_span = function (dt, { relative = true } = {}) {
    if (dt.generationTime) dt = new Date(dt.generationTime * 1000);
    else if (typeof dt == 'number' || typeof dt == 'string') dt = new Date(dt);
    return '<span class="time{0}" data-timestamp="{1}">{2}</span>'.format(
        relative ? ' relative' : '',
        dt.getTime() / 1000,
        dt.toLocaleString()
    );
};
exports.paginate = function* (page, num_pages) {
    let radius = 2, first, last;
    if (page > 1) {
        yield ['first', 1];
        yield ['previous', page - 1];
    }
    if (page <= radius) [first, last] = [1, Math.min(1 + radius * 2, num_pages)];
    else if (page >= num_pages - radius) [first, last] = [Math.max(1, num_pages - radius * 2), num_pages];
    else[first, last] = [page - radius, page + radius];
    if (first > 1) yield ['ellipsis', 0];
    for (let page0 = first; page0 < last + 1; page0++) {
        if (page0 != page) yield ['page', page0];
        else yield ['current', page];
    }
    if (last < num_pages) yield ['ellipsis', 0];
    if (page < num_pages) yield ['next', page + 1];
    yield ['last', num_pages];
};
exports.format_size = function (size, base = 1) {
    size *= base;
    let unit = 1024;
    let unit_names = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    for (let unit_name of unit_names) {
        if (size < unit) return '{0} {1}'.format(Math.round(size), unit_name);
        size /= unit;
    }
    return '{0} {1}'.format(Math.round(size * unit), unit_names[unit_names.length - 1]);
};