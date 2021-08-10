import { iterateAllProblem, iterateAllProblemInDomain } from 'hydrooj/src/pipelineUtils';
import sonic from './service';

export const description = 'Sonic problem search re-index';

export async function run({ domainId }, report) {
    if (domainId) await sonic.flushb('problem', domainId);
    else await sonic.flushc('problem');
    let i = 0;
    const cb = async (pdoc) => {
        i++;
        if (!(i % 1000)) report({ message: `${i} problems indexed` });
        await Promise.all([
            sonic.push('problem', `${pdoc.domainId}@title`, pdoc.docId.toString(), pdoc.title),
            sonic.push('problem', `${pdoc.domainId}@content`, pdoc.docId.toString(), pdoc.content.toString()),
        ]).catch((e) => console.log(`${pdoc.domainId}/${pdoc.docId}`, e));
    };
    if (domainId) await iterateAllProblemInDomain(domainId, ['title', 'content'], cb);
    else await iterateAllProblem(['title', 'content'], cb);
    return true;
}

export const validate = {
    $or: [
        { domainId: 'string' },
        { domainId: 'undefined' },
    ],
};

global.Hydro.script.ensureSonicSearch = { run, description, validate };
