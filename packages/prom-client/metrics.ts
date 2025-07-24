import {
    collectDefaultMetrics, Counter, Gauge, Metric, Registry,
} from 'prom-client';
import { Context, db } from 'hydrooj';

declare module 'hydrooj' {
    interface Context {
        metrics: Registry;
    }
}

export function createRegistry(ctx: Context) {
    const registry = new Registry();

    registry.setDefaultLabels({ instanceid: process.env.NODE_APP_INSTANCE });
    function createMetric<Q extends string, T extends (new (a: any) => Metric<Q>)>(
        C: T, name: string, help: string, extra?: T extends new (a: infer R) => any ? Partial<R> : never,
    ): T extends (new (a) => Gauge<Q>) ? Gauge<Q> : T extends (new (a) => Counter<Q>) ? Counter<Q> : Metric<Q> {
        const metric = new C({ name, help, ...extra });
        registry.registerMetric(metric);
        return metric as any;
    }

    const reqCounter = createMetric(Counter, 'hydro_reqcount', 'reqcount', {
        labelNames: ['domainId'],
    });
    ctx.on('handler/create', (h) => reqCounter.inc({ domainId: (h as any).category || h.args.domainId }));

    const judgeCounter = createMetric(Counter, 'hydro_judgecount', 'judgecount');
    ctx.on('record/judge', () => judgeCounter.inc());

    createMetric(Gauge, 'hydro_regcount', 'regcount', {
        async collect() {
            this.set({}, await db.collection('user').countDocuments());
        },
    });

    const submissionCounter = createMetric(Counter, 'hydro_submission', 'submissioncount', {
        labelNames: ['lang', 'domainId'],
    });
    ctx.on('handler/after/ProblemSubmit#post', (that) => {
        submissionCounter.inc({ lang: that.args.lang, domainId: that.args.domainId });
    });

    const connectionGauge = createMetric(Gauge, 'hydro_connection', 'connectioncount', {
        labelNames: ['domainId'],
    });
    ctx.on('connection/active', (h) => {
        connectionGauge.inc({ domainId: (h as any).category || h.args.domainId });
    });
    ctx.on('connection/close', (h) => {
        connectionGauge.dec({ domainId: (h as any).category || h.args.domainId });
    });

    const taskColl = db.collection('task');
    createMetric(Gauge, 'hydro_task', 'taskcount', {
        async collect() {
            const data = await taskColl.aggregate([
                { $group: { _id: '$type', count: { $sum: 1 } } },
            ]).toArray();
            this.reset();
            for (const line of data) {
                this.set({ type: line._id as unknown as string }, line.count);
            }
        },
        labelNames: ['type'],
    });

    ctx.inject(['server'], () => {
        const gauge = createMetric(Gauge, 'hydro_active_handler', 'active handler count', {
            async collect() {
                const stats = ctx.server.statistics();
                this.reset();
                for (const key in stats) this.set({ type: key }, stats[key]);
            },
            labelNames: ['type'],
        });
        return () => {
            gauge.remove();
        };
    });

    const eventCounter = createMetric(Counter, 'hydro_eventcount', 'eventcount', {
        labelNames: ['name'],
    });
    ctx.on('bus/broadcast', (name) => {
        eventCounter.inc({ name });
    });

    collectDefaultMetrics({ register: registry });

    ctx.provide('metrics', registry);
    return registry;
}
