import nodejieba from 'nodejieba';
import { Pdoc } from 'hydrooj';
import * as document from 'hydrooj/dist/model/document';

export const description = 'Ensure index for problem search';

export async function run() {
    await document.coll.find({ docType: document.TYPE_PROBLEM }).forEach(async (doc: Pdoc) => {
        const segments = nodejieba.cutForSearch(doc.title);
        await document.coll.updateOne({ _id: doc._id }, { $set: { search: segments.join(' ') } });
    });
}

export const validate = {};

global.Hydro.script.ensureSearch = { run, description, validate };
