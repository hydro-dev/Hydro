import { Cursor } from 'mongodb';
import { ValidationError } from '../error';

async function paginate(
    cursor: Cursor, page: number, pageSize: number,
): Promise<[any[]/* docs */, number/* numPages */, number/* count */]> {
    if (page <= 0) throw new ValidationError('page');
    const [count, pageDocs] = await Promise.all([
        cursor.count(),
        cursor.skip((page - 1) * pageSize).limit(pageSize).toArray(),
    ]);
    const numPages = Math.floor((count + pageSize - 1) / pageSize);
    return [pageDocs, numPages, count];
}

export = paginate;

global.Hydro.lib.paginate = paginate;
