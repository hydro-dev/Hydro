import { Schema } from 'hydrooj';
import DomainModel from 'hydrooj/src/model/domain';
import { iterateAllProblem, iterateAllProblemInDomain } from 'hydrooj/src/pipelineUtils';
import sonic from './service';

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

export const apply = (ctx) => ctx.addScript(
    'ensureSonicSearch', 'Sonic problem search re-index',
    Schema.object({
        domainId: Schema.string(),
    }),
    run,
);
