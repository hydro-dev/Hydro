let q = {};
module.exports = {
    async connect() { },
    async assert(queue) {
        q[queue] = q[queue] || [];
    },
    async push(queue, data) {
        q[queue].push(data);
    },
    async get(queue, wait = true) {
        if (wait) {
            while (!q[queue].length)
                await new Promise(resolve => {
                    setTimeout(resolve, 100);
                });
            let data = q[queue][0];
            q[queue].splice(0, 1);
            return data;
        } else {
            if (!q[queue].length) return null;
            else {
                let data = q[queue][0];
                q[queue].splice(0, 1);
                return data;
            }
        }
    }
};
