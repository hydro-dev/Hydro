const { EventEmitter } = require('events');

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

function publish(event, payload, isMaster = true) {
    if (isMaster && process.send) {
        process.send({
            event: 'bus',
            eventName: event,
            payload,
        });
    } else {
        bus.emit(event, { value: payload, event });
    }
}

global.Hydro.service.bus = module.exports = {
    subscribe, unsubscribe, publish,
};
