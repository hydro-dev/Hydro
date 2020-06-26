const { EventEmitter } = require('events');
const cluster = require('cluster');

const bus = new EventEmitter();

function subscribe(events, handler, funcName) {
    if (!funcName) {
        for (const event of events) bus.on(event, handler);
    } else {
        handler.__bus = (...args) => {
            handler[funcName].call(handler, ...args);
        };
        for (const event of events) bus.on(event, handler.__bus);
    }
}

function unsubscribe(events, handler, funcName) {
    if (!funcName) {
        for (const event of events) bus.off(event, handler);
    } else {
        handler.__bus = (...args) => {
            handler[funcName].call(handler, ...args);
        };
        for (const event of events) bus.off(event, handler.__bus);
        delete handler.__bus;
    }
}

function publish(event, data, isMaster = true) {
    bus.emit(event, { value: data, event });
    if (isMaster && global.Hydro.model.task) {
        global.Hydro.model.task.add({
            type: 'bus',
            count: Object.keys(cluster.workers).length,
            sender: cluster.worker.id,
            event,
            data,
        });
    }
}

function postInit() {
    const { task } = global.Hydro.model;
    task.consume({ type: 'bus' }, (data) => {
        if (data.sender === cluster.worker.id) return;
        publish(data.event, data.value, false);
    });
}

global.Hydro.service.bus = module.exports = {
    subscribe, unsubscribe, publish, postInit,
};
