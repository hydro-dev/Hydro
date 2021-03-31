import storage from '../service/storage';
import { iterateAllProblem, iterateAllProblemInDomain } from '../upgrade';

export const description = 'Sync problem filelist from s3 service';

export async function run({ domainId }, report: Function) {
    const cb = async (pdoc) => {
        report({ message: `${pdoc.domainId}/${pdoc.docId}` });
        const [data, additional_file] = await Promise.all([
            storage.list(`problem/${pdoc.domainId}/${pdoc.docId}/testdata/`),
            storage.list(`problem/${pdoc.domainId}/${pdoc.docId}/additional_files/`),
        ]) as any;
        for (let i = 0; i < data.length; i++) {
            data[i]._id = data[i].name;
        }
        for (let i = 0; i < additional_file.length; i++) {
            additional_file[i]._id = additional_file[i].name;
        }
        return { data, additional_file };
    };
    if (domainId) await iterateAllProblemInDomain(domainId, [], cb);
    else await iterateAllProblem([], cb);
    return true;
}

export const validate = {
    $or: [
        { domainId: 'string' },
        { domainId: 'undefined' },
    ],
};

global.Hydro.script.updateFilelist = { run, description, validate };
