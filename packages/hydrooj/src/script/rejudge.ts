import { Filter, ObjectId } from 'mongodb';
import Schema from 'schemastery';
import { Context } from '../context';
import { RecordDoc } from '../interface';
import { STATUS, STATUS_SHORT_TEXTS } from '../model/builtin';
import record from '../model/record';

export const apply = (ctx: Context) => ctx.addScript(
    'rejudge', 'rejudge with filter',
    Schema.object({
        rrid: Schema.string(),
        domainId: Schema.string(),
        uid: Schema.number(),
        pid: Schema.number(),
        contest: Schema.string(),
        lang: Schema.string(),
        status: Schema.number(),
        apply: Schema.boolean(),
    }),
    async (arg, report) => {
        const q: Filter<RecordDoc> = { 'files.hack': { $exists: false } };
        for (const key of ['domainId', 'uid', 'pid', 'contest', 'lang', 'status']) {
            if (arg[key]) q[key] = arg[key];
        }
        q.contest ||= { $nin: [record.RECORD_GENERATE, record.RECORD_PRETEST] };
        q.status ||= { $ne: STATUS.STATUS_CANCELED };
        const rdocs = await record.getMulti(arg.domainId, q).project({ _id: 1, contest: 1, status: 1 }).toArray();
        const rdict = new Map(rdocs.map((rdoc) => [rdoc._id, rdoc.status]));
        report({ message: `Found ${rdocs.length} records` });
        ctx.on('record/change', async (rdoc: RecordDoc) => {
            if (rdict.has(rdoc._id)) {
                rdict.delete(rdoc._id);
                report({ message: `Rejudged ${rdoc._id}, ${STATUS_SHORT_TEXTS[rdict.get(rdoc._id)]} -> ${STATUS_SHORT_TEXTS[rdoc.status]}` });
                await record.pushRejudgeResult(new ObjectId(arg.rrid), { rid: rdoc._id, old: rdict.get(rdoc._id), new: rdoc.status });
            }
        });
        if (rdocs.length) {
            const priority = await record.submissionPriority(1, -10000 - rdocs.length * 5 - 50);
            if (arg.apply) {
                await record.reset(arg.domainId, rdocs.map((rdoc) => rdoc._id), true);
            }
            await Promise.all([
                record.judge(arg.domainId, rdocs.filter((i) => i.contest).map((i) => i._id),
                    priority, { detail: false }, { rejudge: arg.apply ? true : 'controlled' }),
                record.judge(arg.domainId, rdocs.filter((i) => !i.contest).map((i) => i._id),
                    priority, {}, { rejudge: arg.apply ? true : 'controlled' }),
            ]);
        }
        return true;
    },
);
