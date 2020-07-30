import cluster from 'cluster';

const bus = {};

export function subscribe(events: string[], handler: any) {
    const id = String.random(16);
    for (const event of events) {
        if (!bus[event]) bus[event] = {};
        bus[event][id] = handler;
    }
    return id;
}

export function unsubscribe(events: string[], id: string) {
    for (const event of events) {
        if (!bus[event]) bus[event] = {};
        delete bus[event][id];
    }
}

export function publish(event: string, payload: any, isMaster = true) {
    // Process forked by pm2 would also have process.send
    if (isMaster && process.send && !cluster.isMaster) {
        process.send({
            event: 'bus',
            eventName: event,
            payload,
        });
    } else {
        if (!bus[event]) bus[event] = {};
        const funcs = Object.keys(bus[event]);
        Promise.all(funcs.map((func) => bus[event][func]()));
    }
}

global.Hydro.service.bus = {
    subscribe, unsubscribe, publish,
};
