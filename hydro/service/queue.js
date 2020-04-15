const q = {};
module.exports = {
    async connect() { }, // eslint-disable-line no-empty-function
    async assert(queue) {
        q[queue] = q[queue] || [];
    },
    async push(queue, data) {
        q[queue].push(data);
    },
    async get(queue, wait = true) {
        if (wait) {
            while (!q[queue].length) {
                await new Promise((resolve) => { // eslint-disable-line no-await-in-loop
                    setTimeout(resolve, 100);
                });
            }
            const data = q[queue][0];
            q[queue].splice(0, 1);
            return data;
        }
        if (!q[queue].length) return null;

        const data = q[queue][0];
        q[queue].splice(0, 1);
        return data;
    },
};
