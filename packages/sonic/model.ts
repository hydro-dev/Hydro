import DomainModel from 'hydrooj/src/model/domain';
import * as system from 'hydrooj/src/model/system';
import * as bus from 'hydrooj/src/service/bus';
import sonic from './service';

bus.on('problem/add', async (doc, docId) => {
    const union = await DomainModel.searchUnion({ union: doc.domainId, problem: true });
    const tasks = [];
    for (const domainId of [doc.domainId, ...union.map((i) => i._id)]) {
        tasks.push(
            sonic.push('problem', `${domainId}@title`, `${doc.domainId}/${docId}`, doc.title),
            sonic.push('problem', `${domainId}@content`, `${doc.domainId}/${docId}`, doc.content.toString()),
        );
    }
    await Promise.all(tasks);
});

bus.on('problem/edit', async (pdoc) => {
    const union = await DomainModel.searchUnion({ union: pdoc.domainId, problem: true });
    const tasks = [];
    const id = `${pdoc.domainId}/${pdoc.docId}`;
    for (const domainId of [pdoc.domainId, ...union.map((i) => i._id)]) {
        tasks.push(
            sonic.flusho('problem', `${domainId}@title`, id)
                .then(() => sonic.push('problem', `${domainId}@title`, id, pdoc.title)),
            sonic.flusho('problem', `${domainId}@content`, id)
                .then(() => sonic.push('problem', `${domainId}@content`, id, pdoc.content.toString())),
        );
    }
    await Promise.all(tasks);
});

bus.on('problem/del', async (domainId, docId) => {
    const union = await DomainModel.searchUnion({ union: domainId, problem: true });
    const tasks = [];
    const id = `${domainId}/${docId}`;
    for (const domain of [domainId, ...union.map((i) => i._id)]) {
        tasks.push(
            sonic.flusho('problem', `${domain}@title`, id),
            sonic.flusho('problem', `${domain}@content`, id),
        );
    }
    await Promise.all(tasks);
});

global.Hydro.lib.problemSearch = async (domainId: string, query: string, limit = system.get('pagination.problem')) => {
    const ids = await sonic.query('problem', `${domainId}@title`, query, { limit });
    if (limit - ids.length > 0) ids.push(...await sonic.query('problem', `${domainId}@content`, query, { limit: limit - ids.length }));
    return ids;
};
