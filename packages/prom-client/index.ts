import { hostname } from 'os';
import { AggregatorRegistry, Metric } from 'prom-client';
import { Context, Handler, SystemModel } from 'hydrooj';
import { createRegistry } from './metrics';

declare module 'hydrooj' {
    interface EventMap {
        metrics: (id: string, metrics: any) => void;
    }
    interface SystemKeys {
        'prom-client.name': string;
        'prom-client.password': string;
        'prom-client.collect_rate': number;
    }
}

const instances: Record<string, Metric[]> = {};

class MetricsHandler extends Handler {
    noCheckPermView = true;
    notUsage = true;

    async get() {
        if (!this.request.headers.authorization) {
            this.response.status = 401;
            this.response.body = {};
            this.response.addHeader('WWW-Authenticate', 'Basic');
            return;
        }
        const [name, password] = SystemModel.getMany(['prom-client.name', 'prom-client.password']);
        const key = this.request.headers.authorization.split('Basic ')?.[1];
        if (!key || key !== Buffer.from(`${name}:${password}`).toString('base64')) {
            this.response.status = 403;
            this.response.body = {};
            return;
        }
        this.response.body = await AggregatorRegistry.aggregate(Object.values(instances)).metrics();
        this.response.type = 'text/plain';
    }
}

export function apply(ctx: Context) {
    if (process.env.HYDRO_CLI) return;
    const registry = createRegistry(ctx);
    ctx.on('metrics', (id, metrics) => { instances[id] = metrics; });
    ctx.setInterval(async () => {
        ctx.broadcast('metrics', `${hostname()}/${process.env.NODE_APP_INSTANCE}`, await registry.getMetricsAsJSON());
    }, 5000 * (+SystemModel.get('prom-client.collect_rate') || 1));
    ctx.Route('metrics', '/metrics', MetricsHandler);
}
