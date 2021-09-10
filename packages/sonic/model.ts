import * as system from 'hydrooj/src/model/system';
import * as bus from 'hydrooj/src/service/bus';
import sonic from './service';

bus.on('problem/add', async (doc, docId) => {
    await sonic.push('problem', `${doc.domainId}@title`, docId.toString(), doc.title);
    await sonic.push('problem', `${doc.domainId}@content`, docId.toString(), doc.content.toString());
});

bus.on('problem/edit', async (pdoc) => {
    await sonic.flusho('problem', `${pdoc.domainId}@title`, pdoc.docId.toString());
    await sonic.flusho('problem', `${pdoc.domainId}@content`, pdoc.docId.toString());
    await sonic.push('problem', `${pdoc.domainId}@title`, pdoc.docId.toString(), pdoc.title);
    await sonic.push('problem', `${pdoc.domainId}@content`, pdoc.docId.toString(), pdoc.content.toString());
});

bus.on('problem/del', async (domainId, docId) => {
    await sonic.flusho('problem', `${domainId}@title`, docId.toString());
    await sonic.flusho('problem', `${domainId}@content`, docId.toString());
});

global.Hydro.lib.problemSearch = async (domainId: string, query: string, limit = system.get('pagination.problem')) => {
    const docIds = await sonic.query('problem', `${domainId}@title`, query, { limit });
    if (limit - docIds.length > 0) docIds.push(...await sonic.query('problem', `${domainId}@content`, query, { limit: limit - docIds.length }));
    return docIds.map(Number);
};
