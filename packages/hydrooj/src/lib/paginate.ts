import { FindCursor } from 'mongodb';
import { ValidationError } from '../error';
import db from '../service/db';

async function paginate<T>(
    cursor: FindCursor<T>, page: number, pageSize: number,
): Promise<[docs: T[], numPages: number, count: number]> {
    if (page <= 0) throw new ValidationError('page');
    let filter = {};
    for (const key of Object.getOwnPropertySymbols(cursor)) {
        if (key.toString() !== 'Symbol(filter)') continue;
        filter = cursor[key];
        break;
    }
    const [count, pageDocs] = await Promise.all([
        db.collection(cursor.namespace.collection as any).countDocuments(filter),
        cursor.skip((page - 1) * pageSize).limit(pageSize).toArray(),
    ]);
    const numPages = Math.floor((count + pageSize - 1) / pageSize);
    return [pageDocs, numPages, count];
}

export = paginate;
