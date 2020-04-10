const { ValidationError } = require('../error');
module.exports = async function paginate(cursor, page, page_size) {
    if (page <= 0) throw new ValidationError('page');
    let [count, page_docs] = await Promise.all([
        cursor.count(),
        cursor.skip((page - 1) * page_size).limit(page_size).toArray()
    ]);
    let num_pages = Math.floor((count + page_size - 1) / page_size);
    return [page_docs, num_pages, count];
};
