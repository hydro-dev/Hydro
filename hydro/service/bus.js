const { EventEmitter } = require('events');

const bus = new EventEmitter();
module.exports = {
    subscribe(events, handler) {
        for (const event of events) bus.on(event, handler);
    },
    unsubscribe(events, handler) {
        for (const event of events) bus.off(event, handler);
    },
    publish(event, data) {
        bus.emit(event, { value: data, event });
    },
};
