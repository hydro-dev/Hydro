import {
    Ingest, PushOptions, QueryOptions,
    Search, SuggestOptions,
} from 'sonic-channel';
import {
    Context, iterateAllProblem, iterateAllProblemInDomain,
    Logger, ProblemModel, Schema, Service, SystemModel,
} from 'hydrooj';

declare module 'hydrooj' {
    interface Context {
        sonic?: SonicService;
    }
}

const logger = new Logger('sonic');

function getHandler(type: string, that: any) {
    return {
        connected() {
            logger.info(`Sonic Channel succeeded to connect to host (${type}).`);
        },
        disconnected() {
            logger.error(`Sonic Channel is now disconnected (${type}).`);
        },
        timeout() {
            logger.error(`Sonic Channel connection timed out (${type}).`);
        },
        retrying() {
            logger.error(`Trying to reconnect to Sonic Channel (${type})...`);
        },
        error(error) {
            that.error = error;
            logger.error(`Sonic Channel failed to connect to host (${type}).`, error);
        },
    };
}

export class SonicService extends Service {
    public search: Search;
    public ingest: Ingest;
    public error = '';

    static Config = Schema.object({
        host: Schema.string().default('::1'),
        port: Schema.number().default(1491),
        auth: Schema.string().default(''),
    });

    constructor(ctx: Context, private config: ReturnType<typeof SonicService.Config>) {
        super(ctx, 'sonic');
    }

    *[Context.init]() {
        this.search = new Search(this.config);
        this.ingest = new Ingest(this.config);
        this.search.connect(getHandler('search', this));
        yield () => this.search.close();
        this.ingest.connect(getHandler('ingest', this));
        yield () => this.ingest.close();
        yield this.ctx.on('problem/add', async (doc, docId) => {
            Promise.all([
                this.push('problem', `${doc.domainId}@title`, `${doc.domainId}/${docId}`, `${doc.pid || ''} ${doc.title} ${doc.tag?.join(' ')}`),
                this.push('problem', `${doc.domainId}@content`, `${doc.domainId}/${docId}`, doc.content.toString()),
            ]).catch((e) => logger.error(e));
        });
        yield this.ctx.on('problem/edit', async (pdoc) => {
            const id = `${pdoc.domainId}/${pdoc.docId}`;
            Promise.all([
                this.flusho('problem', `${pdoc.domainId}@title`, id)
                    .then(() => this.push('problem', `${pdoc.domainId}@title`, id, `${pdoc.pid || ''} ${pdoc.title} ${pdoc.tag?.join(' ')}`)),
                this.flusho('problem', `${pdoc.domainId}@content`, id)
                    .then(() => this.push('problem', `${pdoc.domainId}@content`, id, pdoc.content.toString())),
            ]).catch((e) => logger.error(e));
        });
        yield this.ctx.on('problem/delete', async (domainId, docId) => {
            const id = `${domainId}/${docId}`;
            await Promise.all([
                this.flusho('problem', `${domainId}@title`, id),
                this.flusho('problem', `${domainId}@content`, id),
            ]);
        });
        yield this.ctx.provideModule('problemSearch', 'sonic', async (domainId, query, opts) => {
            const limit = opts?.limit || SystemModel.get('pagination.problem');
            let hits = await this.query('problem', `${domainId}@title`, query, { limit });
            if (!opts.skip) {
                let pdoc = await ProblemModel.get(domainId, +query || query, ProblemModel.PROJECTION_LIST);
                if (pdoc) {
                    hits = hits.filter((i) => i !== `${pdoc.domainId}/${pdoc.docId}`);
                    hits.unshift(`${pdoc.domainId}/${pdoc.docId}`);
                } else if (/^P\d+$/.test(query)) {
                    pdoc = await ProblemModel.get(domainId, +query.substring(1), ProblemModel.PROJECTION_LIST);
                    if (pdoc) hits.unshift(`${pdoc.domainId}/${pdoc.docId}`);
                }
            }
            if (limit - hits.length > 0) hits.push(...await this.query('problem', `${domainId}@content`, query, { limit: limit - hits.length }));
            return {
                countRelation: hits.length >= limit ? 'gte' : 'eq',
                total: hits.length,
                hits,
            };
        });
        yield this.ctx.addScript(
            'ensureSonicSearch', 'Sonic problem search re-index',
            Schema.object({
                domainId: Schema.string(),
            }),
            async ({ domainId }, report) => {
                if (domainId) await this.flushb('problem', domainId);
                else await this.flushc('problem');
                let i = 0;
                const cb = async (pdoc) => {
                    i++;
                    if (!(i % 1000)) report({ message: `${i} problems indexed` });
                    await Promise.all([
                        pdoc.title && this.push(
                            'problem', `${pdoc.domainid}@title`, `${pdoc.domainId}/${pdoc.docId}`,
                            `${pdoc.pid || ''} ${pdoc.title} ${pdoc.tag.join(' ')}`,
                        ),
                        pdoc.content.toString()
                        && this.push('problem', `${pdoc.domainId}@content`, `${pdoc.domainId}/${pdoc.docId}`, pdoc.content.toString()),
                    ]).catch((e) => console.log(`${pdoc.domainId}/${pdoc.docId}`, e));
                };
                if (domainId) await iterateAllProblemInDomain(domainId, ['title', 'content'], cb);
                else await iterateAllProblem(['title', 'content', 'tag'], cb);
                return true;
            },
        );

        this.ctx.i18n.load('zh', {
            'Sonic problem search re-index': '重建题目搜索索引。',
        });
    }

    async query(collection: string, bucket: string, terms: string, options?: QueryOptions) {
        return await this.search.query(collection, bucket, terms, options);
    }

    async suggest(collection: string, bucket: string, word: string, options?: SuggestOptions) {
        return await this.search.suggest(collection, bucket, word, options);
    }

    async push(collection: string, bucket: string, object: string, text: string, options?: PushOptions) {
        return await this.ingest.push(collection, bucket, object, text, options);
    }

    async pop(collection: string, bucket: string, object: string, text: string) {
        return await this.ingest.pop(collection, bucket, object, text);
    }

    async count(collection: string, bucket?: string, object?: string) {
        return await this.ingest.count(collection, bucket, object);
    }

    async flusho(collection: string, bucket: string, object: string) {
        return await this.ingest.flusho(collection, bucket, object);
    }

    async flushb(collection: string, bucket: string) {
        return await this.ingest.flushb(collection, bucket);
    }

    async flushc(collection: string) {
        return await this.ingest.flushc(collection);
    }
}
