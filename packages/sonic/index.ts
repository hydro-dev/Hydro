import {
    Context, iterateAllProblem, iterateAllProblemInDomain,
    Logger, ProblemModel, Schema, SystemModel,
} from 'hydrooj';
import { SonicService } from './service';

const logger = new Logger('sonic');

export const inject = { 'sonic': { required: false } };
export function apply(ctx: Context) {
    ctx.plugin(SonicService);

    global.Hydro.lib.problemSearch = async (domainId, query, opts) => {
        const limit = opts?.limit || SystemModel.get('pagination.problem');
        let hits = await ctx.sonic.query('problem', `${domainId}@title`, query, { limit });
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
        if (limit - hits.length > 0) hits.push(...await ctx.sonic.query('problem', `${domainId}@content`, query, { limit: limit - hits.length }));
        return {
            countRelation: hits.length >= limit ? 'gte' : 'eq',
            total: hits.length,
            hits,
        };
    };

    async function run({ domainId }, report) {
        if (domainId) await ctx.sonic.flushb('problem', domainId);
        else await ctx.sonic.flushc('problem');
        let i = 0;
        const cb = async (pdoc) => {
            i++;
            if (!(i % 1000)) report({ message: `${i} problems indexed` });
            await Promise.all([
                pdoc.title && ctx.sonic.push(
                    'problem', `${pdoc.domainid}@title`, `${pdoc.domainId}/${pdoc.docId}`,
                    `${pdoc.pid || ''} ${pdoc.title} ${pdoc.tag.join(' ')}`,
                ),
                pdoc.content.toString()
                && ctx.sonic.push('problem', `${pdoc.domainId}@content`, `${pdoc.domainId}/${pdoc.docId}`, pdoc.content.toString()),
            ]).catch((e) => console.log(`${pdoc.domainId}/${pdoc.docId}`, e));
        };
        if (domainId) await iterateAllProblemInDomain(domainId, ['title', 'content'], cb);
        else await iterateAllProblem(['title', 'content', 'tag'], cb);
        return true;
    }

    ctx.on('problem/add', async (doc, docId) => {
        Promise.all([
            ctx.sonic.push('problem', `${doc.domainId}@title`, `${doc.domainId}/${docId}`, `${doc.pid || ''} ${doc.title} ${doc.tag?.join(' ')}`),
            ctx.sonic.push('problem', `${doc.domainId}@content`, `${doc.domainId}/${docId}`, doc.content.toString()),
        ]).catch((e) => logger.error(e));
    });

    ctx.on('problem/edit', async (pdoc) => {
        const id = `${pdoc.domainId}/${pdoc.docId}`;
        Promise.all([
            ctx.sonic.flusho('problem', `${pdoc.domainId}@title`, id)
                .then(() => ctx.sonic.push('problem', `${pdoc.domainId}@title`, id, `${pdoc.pid || ''} ${pdoc.title} ${pdoc.tag?.join(' ')}`)),
            ctx.sonic.flusho('problem', `${pdoc.domainId}@content`, id)
                .then(() => ctx.sonic.push('problem', `${pdoc.domainId}@content`, id, pdoc.content.toString())),
        ]).catch((e) => logger.error(e));
    });

    ctx.on('problem/del', async (domainId, docId) => {
        const id = `${domainId}/${docId}`;
        await Promise.all([
            ctx.sonic.flusho('problem', `${domainId}@title`, id),
            ctx.sonic.flusho('problem', `${domainId}@content`, id),
        ]);
    });

    ctx.addScript(
        'ensureSonicSearch', 'Sonic problem search re-index',
        Schema.object({
            domainId: Schema.string(),
        }),
        run,
    );

    ctx.i18n.load('zh', {
        'Sonic problem search re-index': '重建题目搜索索引。',
    });
}
