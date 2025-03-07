import path from 'path';
import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';
import react from '@vitejs/plugin-react-swc';
import c2k from 'koa2-connect';
import _ from 'lodash';
import { createServer } from 'vite';
import { } from '@hydrooj/framework';
import {
    BadRequestError, Context, db, DocumentModel, Handler, ObjectId, param, ProblemModel, RecordModel, SettingModel,
    StorageModel,
} from 'hydrooj';

export async function apply(ctx: Context) {
    if (process.env.HYDRO_CLI) return;
    const vite = await createServer({
        server: {
            middlewareMode: true,
            hmr: {
                port: 3010,
            },
            headers: {
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp',
            },
            allowedHosts: ['beta.hydro.ac'],
        },
        appType: 'custom',
        root: __dirname,
        base: '/',
        plugins: [react()],
        optimizeDeps: {
            esbuildOptions: {
                plugins: [
                    // @ts-ignore
                    importMetaUrlPlugin,
                ],
            },
        },
        worker: {
            format: 'es',
        },
    });
    const middleware = c2k(vite.middlewares);
    const capture = ['/@vite/', '/src/', '/node_modules/', '/@react-refresh', '/@fs'];
    for (const route of capture) {
        ctx.server.addCaptureRoute(route, middleware);
    }
    const html = require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    console.log(html);
    ctx.server.registerRenderer('next', {
        name: 'next',
        accept: ['main.html'],
        output: 'html',
        asFallback: false,
        priority: 100,
        render: async (name, args, context) => await vite.transformIndexHtml(context.handler.context.req.url, html),
    });

    ctx.on('dispose', async () => {
        await vite.close().catch((e) => console.error(e));
    });
}
