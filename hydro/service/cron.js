class Cron {
    constructor() {
        this.tasks = [];
    }

    plan(time, task) {
        const now = new Date();
        if (!(time instanceof Date)) time = new Date(time);
        this.tasks.push({
            id: setTimeout(() => {
                for (const i in this.tasks) {
                    if (this.tasks[i].func === task) {
                        this.tasks.splice(i, 1);
                        break;
                    }
                }
                task();
            }, time - now),
            func: task,
        });
    }

    interval(time, task) {
        const now = new Date();
        if (!(time instanceof Date)) time = new Date(time);
        this.tasks.push({
            id: setTimeout(() => { task(); }, time - now),
            func: task,
        });
    }
}

module.exports = Cron;
