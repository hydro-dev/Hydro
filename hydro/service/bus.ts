import { EventEmitter } from 'events';
import cluster from 'cluster';

const bus = new EventEmitter();

export function subscribe(events, handler, funcName) {
    if (!funcName) {
        for (const event of events) bus.on(event, handler);
    } else {
        handler.__bus = (...args) => {
            handler[funcName].call(handler, ...args);
        };
        for (const event of events) bus.on(event, handler.__bus);
    }
}

export function unsubscribe(events, handler, funcName) {
    if (!funcName) {
        for (const event of events) bus.off(event, handler);
    } else {
        handler.__bus = (...args) => {
            handler[funcName].call(handler, ...args);
        };
        // FIXME doesn't work
        for (const event of events) bus.off(event, handler.__bus);
        delete handler.__bus;
    }
}

export function publish(event, payload, isMaster = true) {
    // Process forked by pm2 would also have process.send
    if (isMaster && process.send && !cluster.isMaster) {
        process.send({
            event: 'bus',
            eventName: event,
            payload,
        });
    } else {
        bus.emit(event, { value: payload, event });
    }
}

global.Hydro.service.bus = {
    subscribe, unsubscribe, publish,
};

export default global.Hydro.service.bus;
