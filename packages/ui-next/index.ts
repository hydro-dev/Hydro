import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import esbuild from 'esbuild';
import c2k from 'koa2-connect/ts';
import { createServer, type Plugin } from 'vite';
import { serializer } from '@hydrooj/framework';
import {
    Context, Handler, Logger,
    NotFoundError, param, size, Types,
} from 'hydrooj';

const logger = new Logger('ui-next');

const PENDING_HTML = `<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hydro</title>
    <meta http-equiv="refresh" content="3">
</head>
<body>
    <p>Hydro UI is building, please wait and refresh...</p>
</body>
</html>`;

const INJECT_MARKER = '<!-- __HYDRO_INJECTION__DO_NOT_REMOVE_THIS__ -->';
const buildInject = (data: string) => `<script id="__HYDRO_INJECTION__" type="application/json">${data}</script>`;

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
                const exports = `export default [${entries.map((e, i) => {
                    const addonName = path.basename(path.resolve(e, '..', '..'));
                    return `{ name: '${addonName}', ...plugin${i} }`;
                }).join(', ')}];`;
                return `${imports}\n${exports}`;
            }
            return undefined;
        },
    };
}

const federationPlugin: esbuild.Plugin = {
    name: 'federation',
    setup(b) {
        const mappings: Record<string, string> = {
            react: 'React',
            'react-dom/client': 'ReactDOM',
            'react/jsx-runtime': 'jsxRuntime',
        };

        b.onResolve({ filter: /^@hydrooj\/ui-next/ }, () => ({
            path: 'ui-next',
            namespace: 'hydro-federation',
        }));
        for (const mod of Object.keys(mappings)) {
            b.onResolve({ filter: new RegExp(`^${mod.replaceAll('\\', '\\\\').replaceAll('/', '\\/')}$`) }, () => ({
                path: mod,
                namespace: 'hydro-federation',
            }));
        }
        b.onLoad({ filter: /.*/, namespace: 'hydro-federation' }, (args) => {
            if (args.path === 'ui-next') {
                return { contents: 'module.exports = window.__hydroExports;', loader: 'js' };
            }
            const key = mappings[args.path];
            return { contents: `module.exports = window.__hydroExports['${key}'];`, loader: 'js' };
        });
    },
};

const vfs: Record<string, string> = {};
const hashes: Record<string, string> = {};

class UiNextConstantHandler extends Handler {
    noCheckPermView = true;

    @param('name', Types.Filename)
    async all(domainId: string, name: string) {
        if (!vfs[name]) throw new NotFoundError(name);
        this.response.type = 'application/javascript';
        this.response.body = vfs[name];
        this.response.addHeader('ETag', hashes[name]);
        this.response.addHeader('Cache-Control', 'public, max-age=86400');
    }
}

export async function buildPlugins() {
    const start = Date.now();
    let totalSize = 0;
    const entries: string[] = [];
    for (const addon of Object.values(global.addons)) {
        const uiEntry = path.resolve(addon as string, 'ui', 'index.ts');
        if (fs.existsSync(uiEntry)) entries.push(uiEntry);
    }
    if (!entries.length) {
        vfs['plugins.js'] = 'window.__hydroPlugins = [];';
        hashes['plugins.js'] = '00000000';
        logger.info('No plugins to build');
        return;
    }

    try {
        const result = await esbuild.build({
            stdin: {
                contents: [
                    ...entries.map((e, i) => `import * as plugin${i} from '${e}';`),
                    `window.__hydroPlugins = [${entries.map((e, i) => {
                        const addonName = path.basename(path.resolve(e, '..', '..'));
                        return `{ name: '${addonName}', ...plugin${i} }`;
                    }).join(', ')}];`,
                ].join('\n'),
                resolveDir: process.cwd(),
                loader: 'ts',
            },
            bundle: true,
            format: 'iife',
            write: false,
            target: ['chrome90'],
            plugins: [federationPlugin],
            minify: true,
            jsx: 'automatic',
            jsxImportSource: 'react',
        });
        if (result.errors.length) logger.error('Plugin build errors: %o', result.errors);
        const content = result.outputFiles?.[0]?.text || 'window.__hydroPlugins = [];';
        vfs['plugins.js'] = content;
        hashes['plugins.js'] = crypto.createHash('sha1').update(content).digest('hex').substring(0, 8);
        totalSize += content.length;
        logger.success('Plugins built in %dms (%d entries, %s)', Date.now() - start, entries.length, size(totalSize));
    } catch (e) {
        logger.error('Plugin build failed: %o', e);
    }
}

export async function apply(ctx: Context) {
    if (process.env.HYDRO_CLI) return;

    if (process.env.DEV) {
        const vite = await createServer({
            root: __dirname,
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
            },
            appType: 'custom',
            plugins: [hydroPlugins()],
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
            async render(_name, args, context) {
                const serialized = JSON.stringify({
                    HYDRO_INJECTED: true,
                    name: context.handler.context._matchedRouteName,
                    args: {
                        UserContext: context.UserContext,
                        UiContext: context.handler.UiContext,
                        ...args,
                    },
                    url: context.handler.context.req.url!,
                    route_map: ctx.server.routeMap,
                    endpoint: ctx.setting.get('server.url') || undefined,
                }, serializer(false, context.handler));
                const htmlToRender = html.replace(INJECT_MARKER, buildInject(serialized));
                return await vite.transformIndexHtml(context.handler.context.req.url!, htmlToRender);
            },
        });

        // eslint-disable-next-line consistent-return
        return async () => {
            await vite.close().catch((e) => console.error(e));
        };
    } else {
        ctx.Route('ui_next_constants', '/plugins/:version/:name', UiNextConstantHandler);
        ctx.server.registerRenderer('next', {
            name: 'next',
            accept: [],
            output: 'html',
            asFallback: true,
            priority: 100,
            async render(_name, args, context) {
                const indexHtml = path.join(__dirname, 'public', 'index.html');
                if (!fs.existsSync(indexHtml)) return PENDING_HTML;
                const html = fs.readFileSync(indexHtml, 'utf-8');
                const serialized = JSON.stringify({
                    HYDRO_INJECTED: true,
                    name: context.handler.context._matchedRouteName,
                    args: {
                        UserContext: context.handler.user,
                        UiContext: context.handler.UiContext,
                        ...args,
                    },
                    url: context.handler.context.req.url!,
                    route_map: ctx.server.routeMap,
                    endpoint: ctx.setting.get('server.url') || undefined,
                    plugins_url: `/plugins/${hashes['plugins.js'] || '00000000'}/plugins.js`,
                }, serializer(false, context.handler));
                return html.replace(INJECT_MARKER, buildInject(serialized));
            },
        });
        ctx.on('app/started', buildPlugins);
        const debouncedBuild = ctx.debounce(buildPlugins, 2000);
        const triggerHotUpdate = (filePath?: string) => {
            if (filePath && !filePath.includes('/ui/')) return;
            debouncedBuild();
        };
        ctx.on('app/watch/change', triggerHotUpdate);
        ctx.on('app/watch/unlink', triggerHotUpdate);
        ctx.on('system/setting', () => debouncedBuild());
    }
}
