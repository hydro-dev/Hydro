import {
    Context, DomainModel, iterateAllProblem, iterateAllProblemInDomain,
    Logger, ProblemModel, Schema, SystemModel,
} from 'hydrooj';
import { SonicService } from './service';

const logger = new Logger('sonic');

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
            const union = await DomainModel.getMulti({ union: pdoc.domainId }).toArray();
            const tasks = [];
            for (const did of [pdoc.domainId, ...union.map((j) => j._id)]) {
                tasks.push(
                    pdoc.title && ctx.sonic.push(
                        'problem', `${did}@title`, `${pdoc.domainId}/${pdoc.docId}`,
                        `${pdoc.pid || ''} ${pdoc.title} ${pdoc.tag.join(' ')}`,
                    ),
                    pdoc.content.toString() && ctx.sonic.push('problem', `${did}@content`, `${pdoc.domainId}/${pdoc.docId}`, pdoc.content.toString()),
                );
            }
            await Promise.all(tasks).catch((e) => console.log(`${pdoc.domainId}/${pdoc.docId}`, e));
        };
        if (domainId) await iterateAllProblemInDomain(domainId, ['title', 'content'], cb);
        else await iterateAllProblem(['title', 'content', 'tag'], cb);
        return true;
    }

    ctx.on('problem/add', async (doc, docId) => {
        const union = await DomainModel.getMulti({ union: doc.domainId }).toArray();
        const tasks = [];
        for (const domainId of [doc.domainId, ...union.map((i) => i._id)]) {
            tasks.push(
                ctx.sonic.push('problem', `${domainId}@title`, `${doc.domainId}/${docId}`, `${doc.pid || ''} ${doc.title} ${doc.tag?.join(' ')}`),
                ctx.sonic.push('problem', `${domainId}@content`, `${doc.domainId}/${docId}`, doc.content.toString()),
            );
        }
        Promise.all(tasks).catch((e) => logger.error(e));
    });

    ctx.on('problem/edit', async (pdoc) => {
        const union = await DomainModel.getMulti({ union: pdoc.domainId }).toArray();
        const tasks = [];
        const id = `${pdoc.domainId}/${pdoc.docId}`;
        for (const domainId of [pdoc.domainId, ...union.map((i) => i._id)]) {
            tasks.push(
                ctx.sonic.flusho('problem', `${domainId}@title`, id)
                    .then(() => ctx.sonic.push('problem', `${domainId}@title`, id, `${pdoc.pid || ''} ${pdoc.title} ${pdoc.tag?.join(' ')}`)),
                ctx.sonic.flusho('problem', `${domainId}@content`, id)
                    .then(() => ctx.sonic.push('problem', `${domainId}@content`, id, pdoc.content.toString())),
            );
        }
        Promise.all(tasks).catch((e) => logger.error(e));
    });

    ctx.on('problem/del', async (domainId, docId) => {
        const union = await DomainModel.getMulti({ union: domainId }).toArray();
        const tasks = [];
        const id = `${domainId}/${docId}`;
        for (const domain of [domainId, ...union.map((i) => i._id)]) {
            tasks.push(
                ctx.sonic.flusho('problem', `${domain}@title`, id),
                ctx.sonic.flusho('problem', `${domain}@content`, id),
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

    ctx.i18n.load('zh', {
        'Sonic problem search re-index': '重建题目搜索索引。',
    });
}
