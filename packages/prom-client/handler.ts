import { AggregatorRegistry, metric } from 'prom-client';
import * as system from 'hydrooj/src/model/system';
import * as bus from 'hydrooj/src/service/bus';
import { Handler, Route } from 'hydrooj/src/service/server';
import { registry } from './metrics';

declare module 'hydrooj/src/service/bus' {
    interface EventMap {
        metrics: (id: string, metrics: any) => void;
    }
}
declare module 'hydrooj/src/interface' {
    interface SystemKeys {
        'prom-client.name': string;
        'prom-client.password': string;
        'prom-client.collect_rate': number;
    }
}

const instances: Record<string, metric[]> = {};

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
        const [name, password] = system.getMany(['prom-client.name', 'prom-client.password']);
        const key = this.request.headers.authorization?.split('Basic ')?.[1];
        if (!key || key !== Buffer.from(`${name}:${password}`).toString('base64')) {
            this.response.status = 403;
            this.response.body = {};
            return;
        }
        this.response.body = await AggregatorRegistry.aggregate(Object.values(instances)).metrics();
        this.response.type = 'text/plain';
    }
}

bus.on('metrics', (id, metrics) => { instances[id] = metrics; });
setInterval(async () => {
    bus.broadcast('metrics', process.env.NODE_APP_INSTANCE!, await registry.getMetricsAsJSON());
}, 5000 * (+system.get('prom-client.collect_rate') || 1));

global.Hydro.handler.prom = () => {
    Route('metrics', '/metrics', MetricsHandler);
};
