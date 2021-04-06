import { iterateAllProblem, iterateAllProblemInDomain } from 'hydrooj/dist/pipelineUtils';
import sonic from './service';

export const description = 'Sonic problem search re-index';

export async function run({ domainId }) {
    if (domainId) await sonic.flushb('problem', domainId);
    else await sonic.flushc('problem');
    const cb = async (pdoc) => {
        await sonic.push('problem', `${pdoc.domainId}@title`, pdoc.docId.toString(), pdoc.title);
        await sonic.push('problem', `${pdoc.domainId}@content`, pdoc.docId.toString(), pdoc.content.toString());
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
