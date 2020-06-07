process.stdin.setEncoding('utf8');
process.stdin.on('data', async (input) => {
    try {
        const t = eval(input.toString().trim()); // eslint-disable-line no-eval
        if (t instanceof Promise) console.log(await t);
        else console.log(t);
    } catch (e) {
        console.warn(e);
    }
});
process.on('unhandledRejection', (e) => console.log(e));

global.onDestory = [];
async function terminate() {
    for (const task of global.onDestory) {
        // eslint-disable-next-line no-await-in-loop
        await task();
    }
    process.exit(0);
}
process.on('SIGINT', terminate);

require('./loader').load().catch((e) => {
    console.error(e);
    process.exit(1);
});
