import { Client } from '@elastic/elasticsearch';
import {
    _, Context, iterateAllProblem, iterateAllProblemInDomain,
    ProblemDoc, ProblemModel, ProblemSearch, Schema, Service, SystemModel,
} from 'hydrooj';

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

export default class ElasticSearchService extends Service {
    static Config = Schema.object({
        url: Schema.string().role('url').default('http://127.0.0.1:9200'),
        indexSize: Schema.number().role('indexSize').default(10000).min(0).step(1),
    });

    client: Client;

    constructor(ctx: Context, private config: ReturnType<typeof ElasticSearchService.Config>) {
        super(ctx, 'elastic-search');
        this.client = new Client({ node: config.url });
    }

    async problemSearch(domainId: string, q: string, opts: Parameters<ProblemSearch>[2] = {}): ReturnType<ProblemSearch> {
        const size = opts?.limit || SystemModel.get('pagination.problem');
        const from = Math.min(this.config.indexSize - size, opts?.skip || 0);
        const res = await this.client.search({
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
        if (!opts?.skip) {
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
    }

    async run({ domainId }, report) {
        try {
            if (domainId) await this.client.deleteByQuery({ index: 'problem', query: { match: { domainId } } });
            else await this.client.deleteByQuery({ index: 'problem', query: { match_all: {} } });
        } catch (e) {
            if (!e.message.includes('index_not_found_exception')) throw e;
        }
        let i = 0;
        const cb = async (pdoc) => {
            i++;
            if (!(i % 1000)) report({ message: `${i} problems indexed` });
            await this.client.index({
                index: 'problem',
                id: `${pdoc.domainId}/${pdoc.docId}`,
                document: processDocument(pdoc),
            });
        };
        if (domainId) await iterateAllProblemInDomain(domainId, ProblemModel.PROJECTION_PUBLIC, cb);
        else await iterateAllProblem(ProblemModel.PROJECTION_PUBLIC, cb);
        await this.client.indices.refresh({ index: 'problem' });
        return true;
    }

    async [Context.init]() {
        await this.client.nodes.stats();
        this.ctx.on('problem/add', async (doc, docId) => {
            await this.client.index({
                index: 'problem',
                id: `${doc.domainId}/${docId}`,
                document: processDocument(doc),
            });
        });
        this.ctx.on('problem/edit', async (pdoc) => {
            await this.client.index({
                index: 'problem',
                id: `${pdoc.domainId}/${pdoc.docId}`,
                document: processDocument(pdoc),
            });
        });
        this.ctx.on('problem/delete', async (domainId, docId) => {
            await this.client.delete({
                index: 'problem',
                id: `${domainId}/${docId}`,
            });
        });
        this.ctx.addScript(
            'ensureElasticSearch', 'Elastic problem search re-index',
            Schema.object({
                domainId: Schema.string(),
            }),
            this.run.bind(this),
        );
        this.ctx.provideModule('problemSearch', 'elastic', this.problemSearch.bind(this));
    }
}
