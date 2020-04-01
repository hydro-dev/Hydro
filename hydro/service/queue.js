const options = require('../options');
if (options.mq) {
    const amqplib = require('amqplib');
    /**
     * @type {import('amqplib').Connection}
     */
    let conn = null;
    let ch = null;

    module.exports = {
        async connect() {
            conn = await amqplib.connect(options.mq.url);
            ch = conn.createChannel();
        },
        async assertQueue(queue) {
            return await ch.assertQueue(queue);
        },
        async publish(queue, data) {
            return await ch.sendToQueue(queue, Buffer.from(data));
        },
        async consume(queue, callback) {
            ch.consume(queue, function (msg) {
                if (msg !== null) {
                    callback(msg.content.toString(), () => { ch.ack(msg); });
                    ch.ack(msg);
                }
            });
        }
    };
} else {
    let q = {};
    module.exports = {
        async connect() { },
        async assertQueue(queue) {
            q[queue] = q[queue] || [];
        },
        async publish(queue, data) {
            q[queue].push(data);
        },
        async consume(queue, callback) {
            while (1) {
                if (q[queue].length) {
                    let data = q[queue][0];
                    q[queue].splice(0, 1);
                    callback(data, () => { });
                }
                await new Promise(resolve => {
                    setTimeout(resolve, 500);
                });
            }
        }
    };
}