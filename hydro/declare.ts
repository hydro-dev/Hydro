declare global {
    namespace NodeJS {
        interface Global {
            Hydro: {
                model: any
                handler: any
                script: any
                service: any
                lib: any
                stat: any
                wiki: any
                template: any
                ui: any
                error: any
                locales: any
            }
            nodeModules: any
            onDestory: Function[]
            isFirstWorker: boolean
        }
    }
}

declare module 'cluster' {
    let isFirstWorker: boolean;
}

export { };
