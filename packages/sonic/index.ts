import { Schema } from 'hydrooj';
import { Logger } from 'hydrooj/src/logger';
import DomainModel from 'hydrooj/src/model/domain';
import * as system from 'hydrooj/src/model/system';
import { iterateAllProblem, iterateAllProblemInDomain } from 'hydrooj/src/pipelineUtils';
import sonic from './service';

const logger = new Logger('sonic');

global.Hydro.lib.problemSearch = async (domainId, query, opts) => {
    const limit = opts?.limit || system.get('pagination.problem');
    const ids = await sonic.query('problem', `${domainId}@title`, query, { limit });
    if (limit - ids.length > 0) ids.push(...await sonic.query('problem', `${domainId}@content`, query, { limit: limit - ids.length }));
    return {
        countRelation: ids.length >= limit ? 'gte' : 'eq',
        total: ids.length,
        hits: ids,
    };
};

async function run({ domainId }, report) {
    if (domainId) await sonic.flushb('problem', domainId);
    else await sonic.flushc('problem');
    let i = 0;
    const cb = async (pdoc) => {
        i++;
        if (!(i % 1000)) report({ message: `${i} problems indexed` });
        const union = await DomainModel.searchUnion({ union: pdoc.domainId, problem: true });
        const tasks = [];
        for (const did of [pdoc.domainId, ...union.map((j) => j._id)]) {
            tasks.push(
                pdoc.title && sonic.push(
                    'problem', `${did}@title`, `${pdoc.domainId}/${pdoc.docId}`,
                    `${pdoc.pid || ''} ${pdoc.title} ${pdoc.tag.join(' ')}`,
                ),
                pdoc.content.toString() && sonic.push('problem', `${did}@content`, `${pdoc.domainId}/${pdoc.docId}`, pdoc.content.toString()),
            );
        }
        await Promise.all(tasks).catch((e) => console.log(`${pdoc.domainId}/${pdoc.docId}`, e));
    };
    if (domainId) await iterateAllProblemInDomain(domainId, ['title', 'content'], cb);
    else await iterateAllProblem(['title', 'content', 'tag'], cb);
    return true;
}

export function apply(ctx) {
    ctx.on('problem/add', async (doc, docId) => {
        const union = await DomainModel.searchUnion({ union: doc.domainId, problem: true });
        const tasks = [];
        for (const domainId of [doc.domainId, ...union.map((i) => i._id)]) {
            tasks.push(
                sonic.push('problem', `${domainId}@title`, `${doc.domainId}/${docId}`, `${doc.pid || ''} ${doc.title} ${doc.tag?.join(' ')}`),
                sonic.push('problem', `${domainId}@content`, `${doc.domainId}/${docId}`, doc.content.toString()),
            );
        }
        Promise.all(tasks).catch((e) => logger.error(e));
    });

    ctx.on('problem/edit', async (pdoc) => {
        const union = await DomainModel.searchUnion({ union: pdoc.domainId, problem: true });
        const tasks = [];
        const id = `${pdoc.domainId}/${pdoc.docId}`;
        for (const domainId of [pdoc.domainId, ...union.map((i) => i._id)]) {
            tasks.push(
                sonic.flusho('problem', `${domainId}@title`, id)
                    .then(() => sonic.push('problem', `${domainId}@title`, id, `${pdoc.pid || ''} ${pdoc.title} ${pdoc.tag?.join(' ')}`)),
                sonic.flusho('problem', `${domainId}@content`, id)
                    .then(() => sonic.push('problem', `${domainId}@content`, id, pdoc.content.toString())),
            );
        }
        Promise.all(tasks).catch((e) => logger.error(e));
    });

    ctx.on('problem/del', async (domainId, docId) => {
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

    ctx.addScript(
        'ensureSonicSearch', 'Sonic problem search re-index',
        Schema.object({
            domainId: Schema.string(),
        }),
        run,
    );
}
