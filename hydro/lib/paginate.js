const { ValidationError } = require('../error');

/**
 * @param {import('mongodb').Cursor} cursor
 * @param {number} page
 * @param {number} pageSize
 * @returns {Promise<Array[]>} pageDocs numPages count
 */
async function paginate(cursor, page, pageSize) {
    if (page <= 0) throw new ValidationError('page');
    const [count, pageDocs] = await Promise.all([
        cursor.count(),
        cursor.skip((page - 1) * pageSize).limit(pageSize).toArray(),
    ]);
    const numPages = Math.floor((count + pageSize - 1) / pageSize);
    return [pageDocs, numPages, count];
}

global.Hydro.lib.paginate = module.exports = paginate;
