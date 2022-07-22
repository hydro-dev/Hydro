/* eslint-disable no-await-in-loop */
import { omit } from 'lodash';
import { Index, MeiliSearch } from 'meilisearch';
import DomainModel from 'hydrooj/src/model/domain';
import ProblemModel from 'hydrooj/src/model/problem';
import * as system from 'hydrooj/src/model/system';
import { iterateAllProblem } from 'hydrooj/src/pipelineUtils';
import * as bus from 'hydrooj/src/service/bus';
import { sleep } from 'hydrooj/src/utils';

const client = new MeiliSearch({
    host: system.get('meilisearch.url') || 'http://127.0.0.1:7700',
    apiKey: system.get('meilisearch.masterKey'),
});

const index: Index<{ id: string, title?: string, content?: string }> = client.index('problem');
const indexOmit = ['_id', 'docType', 'data', 'additional_file', 'config', 'stats', 'assign'];

bus.on('problem/add', async (doc, docId) => {
    await index.addDocuments([{
        id: `${doc.domainId}-${docId}`,
        ...omit(doc, indexOmit),
    }]);
});
bus.on('problem/edit', async (pdoc) => {
    await index.updateDocuments([{
        id: `${pdoc.domainId}-${pdoc.docId}`,
        ...omit(pdoc, indexOmit),
    }]);
});
bus.on('problem/del', async (domainId, docId) => {
    await index.deleteDocument(`${domainId}-${docId}`);
});

global.Hydro.lib.problemSearch = async (domainId, q, opts) => {
    const allowedSize = system.get('meilisearch.indexSize') || 10000;
    const limit = opts?.limit || system.get('pagination.problem');
    const offset = Math.min(allowedSize - limit, opts?.skip || 0);
    const union = await DomainModel.getUnion(domainId);
    const domainIds = [domainId, ...(union?.union || [])];
    const res = await index.search(q, {
        offset,
        limit,
        filter: domainIds.map((i) => `domainId = ${i}`).join(' OR '),
    });
    return {
        countRelation: 'eq',
        total: res.estimatedTotalHits,
        hits: res.hits.map((i) => i.id.replace('-', '/')),
    };
};

export const description = 'Meilisearch reindex';

export const validate = {
    $or: [
        { domainId: 'string' },
        { domainId: 'undefined' },
    ],
};

async function waitForTask(id: number) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const status = await client.getTask(id);
        if (status.error) throw new Error(status.error.message);
        if (status.status !== 'processing') break;
        await sleep(1000);
    }
}

export async function run({ domainId }, report) {
    await index.addDocuments([{ id: '1' }]);
    let task = await index.deleteAllDocuments();
    await waitForTask(task.taskUid);
    report({ message: 'old index deleted' });
    task = await index.updateFilterableAttributes(['domainId', 'tag']);
    await waitForTask(task.taskUid);
    report({ message: 'filterable attributes updated' });
    task = await index.updateDisplayedAttributes(['id', 'title', 'tag']);
    await waitForTask(task.taskUid);
    report({ message: 'displayed attributes updated' });
    task = await index.updateSearchableAttributes(['title', 'tag']);
    await waitForTask(task.taskUid);
    report({ message: 'searchable attributes updated' });
    task = await index.updateSortableAttributes(['domainId']);
    await waitForTask(task.taskUid);
    report({ message: 'sortable attributes updated' });
    let i = 0;
    let documents: any[] = [];
    const cb = async (pdoc) => {
        i++;
        if (!(i % 1000)) {
            task = await index.addDocuments(documents);
            await waitForTask(task.taskUid);
            documents = [];
            report({ message: `${i} problems indexed` });
        }
        documents.push({
            id: `${pdoc.domainId}-${pdoc.docId}`,
            ...omit(pdoc, indexOmit),
        });
    };
    await iterateAllProblem(ProblemModel.PROJECTION_PUBLIC, cb);
    if (documents.length) {
        task = await index.addDocuments(documents);
        await waitForTask(task.taskUid);
    }
    return true;
}

global.Hydro.script.ensureMeiliSearch = { run, description, validate };
