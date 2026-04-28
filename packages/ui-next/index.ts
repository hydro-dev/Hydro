import fs from 'fs';
import path from 'path';
import react from '@vitejs/plugin-react';
import c2k from 'koa2-connect/ts';
import { createServer, type Plugin } from 'vite';
import { serializer } from '@hydrooj/framework';
import type { Context } from 'hydrooj';
import type { PageData } from './src/context/page-data';

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
            return undefined;
        },
        load(id) {
            if (id === resolvedVirtualModuleId) {
                const entries: string[] = [];
                for (const addon of Object.values(global.addons)) {
                    const uiEntry = path.resolve(addon, 'ui', 'index.ts');
                    if (fs.existsSync(uiEntry)) entries.push(uiEntry);
                }
                if (!entries.length) return 'export default [];';
                const imports = entries.map((e, i) => `import * as plugin${i} from '${e}';`).join('\n');
                const exports = `export default [${entries.map((_, i) => `plugin${i}`).join(', ')}];`;
                return `${imports}\n${exports}`;
            }
            return undefined;
        },
    };
}

export async function apply(ctx: Context) {
    if (process.env.HYDRO_CLI) return;
    // 现在只是开发环境的实现，生产环境的实现还未完成
    const vite = await createServer({
        clearScreen: false,
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
        worker: {
            format: 'es',
        },
    });
    const middleware = c2k(vite.middlewares);
    const capture = ['/@vite/', '/src/', '/node_modules/', '/@react-refresh', '/@fs', '/@id/'];
    for (const route of capture) {
        ctx.server.addCaptureRoute(route, middleware);
    }
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    ctx.server.registerRenderer('next', {
        name: 'next',
        accept: [],
        output: 'html',
        asFallback: true,
        priority: 100,
        async render(name, args, context) {
            const data: PageData = {
                HYDRO_INJECTED: true,
                name: context.handler.context._matchedRouteName,
                args,
                url: context.handler.context.req.url!,
                routeMap: ctx.server.routeMap,
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
