import fs from 'fs';
import path from 'path';
import importMetaUrlPlugin from '@chialab/esbuild-plugin-meta-url';
import react from '@vitejs/plugin-react';
import c2k from 'koa2-connect/ts';
import { createServer, type Plugin } from 'vite';
import { serializer } from '@hydrooj/framework';
import { Context, getNodes } from 'hydrooj';

const INJECT_MARKER = '<!-- __HYDRO_INJECTION__DO_NOT_REMOVE_THIS__ -->';
const buildInject = (str: string) => `<script id="__HYDRO_INJECTION__" type="application/json">${str}</script>`;

function hydroPlugins(): Plugin {
    const virtualModuleId = 'virtual:hydro-plugins';
    const resolvedVirtualModuleId = `\0${virtualModuleId}`;

    return {
        name: 'hydro-plugins',
        resolveId(id) {
            if (id === virtualModuleId) {
                return resolvedVirtualModuleId;
            }
        },
        load(id) {
            if (id === resolvedVirtualModuleId) {
                const plugins = getNodes('Route');
                if (!plugins) return 'export default [];';
                const imports = plugins.map((p, i) => `import plugin${i} from '${p.args.entry}';`).join('\n');
                const exports = `export default [${plugins.map((p, i) => `plugin${i}`).join(', ')}];`;
                return `${imports}\n${exports}`;
            }
        },
    };
}

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
            // allowedHosts: ['beta.hydro.ac'],
        },
        appType: 'custom',
        root: __dirname,
        base: '/',
        plugins: [react(), hydroPlugins()],
        optimizeDeps: {
            esbuildOptions: {
                plugins: [
                    // @ts-ignore
                    importMetaUrlPlugin(),
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
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    ctx.server.registerRenderer('next', {
        name: 'next',
        accept: ['main.html'],
        output: 'html',
        asFallback: false,
        priority: 100,
        async render(name, args, context) {
            const data = {
                HYDRO_INJECTED: true,
                name,
                args,
                url: context.handler.context.req.url,
            };
            const serialized = JSON.stringify(data, serializer(false, context.handler));
            const htmlToRender = html.replace(INJECT_MARKER, buildInject(serialized));
            return await vite.transformIndexHtml(context.handler.context.req.url!, htmlToRender);
        },
    });

    // eslint-disable-next-line consistent-return
    return async () => {
        await vite.close().catch((e) => console.error(e));
    };
}
