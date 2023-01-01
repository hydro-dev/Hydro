import Document from 'flexsearch/src/document';
import * as cjk from 'flexsearch/src/lang/cjk/default';
import {
    _, buildProjection, Context, DocumentModel, Logger, SystemModel,
} from 'hydrooj';

const logger = new Logger('flexsearch');

export async function apply(ctx: Context) {
    logger.info('Building index...');
    const index = new Document({
        ...cjk,
        tokenize: 'strict',
        // optimize: true,
        // resolution: 9,
        document: {
            id: 'id',
            tag: 'domainId',
            index: [{
                field: 'title',
                tokenize: 'full',
            }],
        },
        worker: true,
    }) as any;
    const pdocs = await DocumentModel.coll.find({ docType: 10 })
        .project(buildProjection(['docId', 'pid', 'domainId', 'title']))
        .toArray();
    for (const pdoc of pdocs as any[]) {
        pdoc.id = `${pdoc.domainId}/${pdoc.docId}`;
        delete pdoc._id;
        delete pdoc.docId;
        index.add(pdoc);
    }
    logger.success('Index built.');
    try {
        await index.searchAsync('a', { tag: 'system', limit: 1 });
    } catch (e) {
        logger.error('Failed to perform search operation.');
        logger.error(e);
        return;
    }
    global.Hydro.lib.problemSearch = async (domainId, query, opts) => {
        const limit = opts?.limit || SystemModel.get('pagination.problem');
        const ids = await index.searchAsync(query, { tag: domainId, limit })[0]?.result || [];
        return {
            countRelation: 'eq',
            total: ids.length,
            hits: ids,
        };
    };

    ctx.on('problem/add', async (doc, docId) => {
        const pdoc = _.pick(doc, ['pid', 'domainId', 'title']) as any;
        pdoc.id = `${doc.domainId}/${docId}`;
        index.add(pdoc);
    });

    ctx.on('problem/edit', async (doc) => {
        const pdoc = _.pick(doc, ['pid', 'domainId', 'title']) as any;
        pdoc.id = `${doc.domainId}/${doc.docId}`;
        index.remove(pdoc.id);
        index.add(pdoc);
    });

    ctx.on('problem/del', async (domainId, docId) => {
        index.remove(`${domainId}/${docId}`);
    });
}
