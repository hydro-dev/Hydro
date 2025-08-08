const versionNum = +process.version.replace(/v/gi, '').split('.')[0];
if (versionNum < 22) throw new Error('NodeJS >=22 required');

console.log('Process', process.pid, 'running as', process.env.NODE_APP_INSTANCE === '0' ? 'master' : 'worker');
if (!global.Hydro) {
    global.Hydro = {
        version: {
            node: process.version.split('v')[1],
            hydrooj: require('hydrooj/package.json').version,
        },
        // @ts-ignore
        model: {},
        script: {},
        module: new Proxy({} as any, {
            get(self, key) {
                self[key] ||= {};
                return self[key];
            },
        }),
        // @ts-ignore
        ui: {},
        // @ts-ignore
        error: {},
        locales: {},
    };
    global.addons = {};
}
global.app = new (require('./context').Context)();
process.on('exit', () => {

});
