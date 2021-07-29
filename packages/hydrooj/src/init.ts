const versionNum = +process.version.replace(/v/gim, '').split('.')[0];
if (versionNum < 14) throw new Error('NodeJS >=v14 required');

if (!global.Hydro) {
    global.Hydro = {
        version: {
            node: process.version,
            hydrooj: require('hydrooj/package.json').version,
        },
        stat: { reqCount: 0 },
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
            nodes: {
                nav: [],
                problem_add: [],
                user_dropdown: [],
            },
            template: {},
        },
        // @ts-ignore
        error: {},
        locales: {},
    };
    global.addons = [];
}
