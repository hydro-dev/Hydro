import { Client } from '@elastic/elasticsearch';
import {
    _, Context, iterateAllProblem, iterateAllProblemInDomain,
    ProblemDoc, ProblemModel, Schema, SystemModel,
} from 'hydrooj';

const client = new Client({ node: SystemModel.get('elastic-search.url') || 'http://127.0.0.1:9200' });

const indexOmit = ['_id', 'docType', 'data', 'additional_file', 'config', 'stats', 'assign'];
const processDocument = (doc: Partial<ProblemDoc>) => {
    doc.content &&= doc.content.replace(/[[\]【】()（）]/g, ' ');
    doc.title &&= doc.title.replace(/[[\]【】()（）]/g, ' ')
        .replace(/([a-zA-Z]{2,})(\d+)/, '$1$2 $1 $2');
    if (doc.pid?.includes('-')) {
        const ns = doc.pid.split('-')[0];
        doc.tag.push(ns);
    }
    doc.pid &&= doc.pid.replace(/([a-zA-Z]{2,})(\d+)/, '$1$2 $1 $2').replace(/-/g, ' ');
    return _.omit(doc, indexOmit);
};

global.Hydro.lib.problemSearch = async (domainId, q, opts) => {
    const allowedSize = SystemModel.get('elasic-search.indexSize') || 10000;
    const size = opts?.limit || SystemModel.get('pagination.problem');
    const from = Math.min(allowedSize - size, opts?.skip || 0);
    const res = await client.search({
        index: 'problem',
        size,
        from,
        query: {
            simple_query_string: {
                query: q.replace(/([a-z0-9]{2,})/gi, (i) => `${i}~5`),
                fields: ['tag^5', 'pid^4', 'title^3', 'content'],
            },
        },
        post_filter: {
            bool: {
                minimum_should_match: 1,
                should: [{ match: { domainId } }],
            },
        },
    });
    let hits = res.hits.hits.map((i) => i._id);
    if (!opts.skip) {
        let pdoc = await ProblemModel.get(domainId, +q || q, ProblemModel.PROJECTION_LIST);
        if (pdoc) {
            hits = hits.filter((i) => i !== `${pdoc.domainId}/${pdoc.docId}`);
            hits.unshift(`${pdoc.domainId}/${pdoc.docId}`);
        } else if (/^P\d+$/.test(q)) {
            pdoc = await ProblemModel.get(domainId, +q.substring(1), ProblemModel.PROJECTION_LIST);
            if (pdoc) hits.unshift(`${pdoc.domainId}/${pdoc.docId}`);
        }
    }
    return {
        countRelation: typeof res.hits.total === 'number' ? 'eq' : res.hits.total.relation,
        total: typeof res.hits.total === 'number' ? res.hits.total : res.hits.total.value,
        hits: Array.from(new Set(hits)),
    };
};

async function run({ domainId }, report) {
    try {
        if (domainId) await client.deleteByQuery({ index: 'problem', query: { match: { domainId } } });
        else await client.deleteByQuery({ index: 'problem', query: { match_all: {} } });
    } catch (e) {
        if (!e.message.includes('index_not_found_exception')) throw e;
    }
    let i = 0;
    const cb = async (pdoc) => {
        i++;
        if (!(i % 1000)) report({ message: `${i} problems indexed` });
        await client.index({
            index: 'problem',
            id: `${pdoc.domainId}/${pdoc.docId}`,
            document: processDocument(pdoc),
        });
    };
    if (domainId) await iterateAllProblemInDomain(domainId, ProblemModel.PROJECTION_PUBLIC, cb);
    else await iterateAllProblem(ProblemModel.PROJECTION_PUBLIC, cb);
    await client.indices.refresh({ index: 'problem' });
    return true;
}

export const apply = (ctx: Context) => {
    ctx.on('problem/add', async (doc, docId) => {
        await client.index({
            index: 'problem',
            id: `${doc.domainId}/${docId}`,
            document: processDocument(doc),
        });
    });
    ctx.on('problem/edit', async (pdoc) => {
        await client.index({
            index: 'problem',
            id: `${pdoc.domainId}/${pdoc.docId}`,
            document: processDocument(pdoc),
        });
    });
    ctx.on('problem/del', async (domainId, docId) => {
        await client.delete({
            index: 'problem',
            id: `${domainId}/${docId}`,
        });
    });
    ctx.addScript(
        'ensureElasticSearch', 'Elastic problem search re-index',
        Schema.object({
            domainId: Schema.string(),
        }),
        run,
    );
};
