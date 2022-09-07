const versionNum = +process.version.replace(/v/gim, '').split('.')[0];
if (versionNum < 12) throw new Error('NodeJS >=12 required');
else if (versionNum < 14 && process.env.NODE_APP_INSTANCE === '0') {
    console.warn('NodeJS version <14, startup performance will be impacted.');
}

console.log('Process', process.pid, 'running as', process.env.NODE_APP_INSTANCE === '0' ? 'master' : 'worker');
if (!global.Hydro) {
    global.Hydro = {
        version: {
            node: process.version.split('v')[1],
            hydrooj: require('hydrooj/package.json').version,
        },
        handler: {},
        // @ts-ignore
        service: {},
        // @ts-ignore
        model: {},
        script: {},
        // @ts-ignore
        lib: {},
        // @ts-ignore
        ui: {
            manifest: {},
            template: {},
        },
        // @ts-ignore
        error: {},
        locales: {},
    };
    global.addons = [];
    global.publicDirs = [];
}
