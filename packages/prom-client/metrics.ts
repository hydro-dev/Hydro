import {
    collectDefaultMetrics, Counter, Gauge, Metric, Registry,
} from 'prom-client';
import * as bus from 'hydrooj/src/service/bus';
import * as db from 'hydrooj/src/service/db';

export const registry = new Registry();
registry.setDefaultLabels({ instanceid: process.env.NODE_APP_INSTANCE });
function createMetric<Q extends string, T extends (new (a: any) => Metric<Q>)>(
    C: T, name: string, help: string, extra?: T extends new (a: infer R) => any ? Partial<R> : never,
): T extends new (a) => Counter<Q> ? Counter<Q> : T extends new (a) => Gauge<Q> ? Gauge<Q> : Metric<Q> {
    const metric = new C({ name, help, ...(extra || {}) });
    registry.registerMetric(metric);
    return metric as any;
}

const reqCounter = createMetric(Counter, 'hydro_reqcount', 'reqcount', {
    labelNames: ['domainId'],
});
bus.on('handler/create', (h) => reqCounter.inc({ domainId: h.args.domainId }));

const judgeCounter = createMetric(Counter, 'hydro_judgecount', 'judgecount');
bus.on('record/judge', () => judgeCounter.inc());

createMetric(Gauge, 'hydro_regcount', 'regcount', {
    async collect() {
        this.set({}, await db.collection('user').countDocuments());
    },
});

const submissionCounter = createMetric(Counter, 'hydro_submission', 'submissioncount', {
    labelNames: ['lang', 'domainId'],
});
bus.on('handler/after/ProblemSubmit', (that) => {
    submissionCounter.inc({ lang: that.args.lang, domainId: that.args.domainId });
});

const taskColl = db.collection('task');
createMetric(Gauge, 'hydro_task', 'taskcount', {
    async collect() {
        const data = await taskColl.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } },
        ]).toArray();
        for (const line of data) {
            this.set({ type: line._id as unknown as string }, line.count);
        }
    },
    labelNames: ['type'],
});

collectDefaultMetrics({ register: registry });
