import fs from 'fs';
import path from 'path';
import esbuild from 'esbuild';
import type { Next } from 'koa';
import c2k from 'koa2-connect/ts';
import { createServer, type Plugin } from 'vite';
import { HandlerCommon, type KoaContext, serializer } from '@hydrooj/framework';
import {
    Context, Handler, Logger,
    NotFoundError, param, SettingModel, sha1, size, Types,
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

function getAddonEntries(): Record<string, string> {
    const entries: Record<string, string> = {};
    for (const [name, addon] of Object.entries(global.addons)) {
        const uiEntry = ['ui/index.ts', 'ui/index.tsx', 'ui/index.js', 'ui/index.jsx']
            .map((f) => path.resolve(addon as string, f))
            .find((f) => fs.existsSync(f));
        if (uiEntry) {
            logger.info('UI entry for addon %s: %s', name, uiEntry);
            entries[name] = uiEntry;
        }
    }
    return entries;
}

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
                const entries = getAddonEntries();
                if (!Object.keys(entries).length) return 'export default [];';
                const imports = Object.entries(entries).map(([_, e], i) => `import * as plugin${i} from '${e}';`).join('\n');
                const exports = `export default [${Object.entries(entries).map(([addon, _], i) => {
                    return `{ name: '${addon}', ...plugin${i} }`;
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

const applyCss = (css: string) => `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(css)};
  document.head.appendChild(style);
})();
`;

function addFile(name: string, content: string) {
    vfs[name] = content;
    hashes[name] = sha1(content).substring(0, 8);
}

async function buildI18n() {
    const localeList: Record<string, { name: string, flag: string }> = {};
    for (const lang in global.Hydro.locales) {
        if (!/^[a-zA-Z_]+$/.test(lang)) continue;
        if (!global.Hydro.locales[lang].__interface) continue;
        addFile(`lang-${lang}.js`, `window.HydroLocale=${JSON.stringify(global.Hydro.locales[lang][Symbol.for('iterate')])};`);
        const id = global.Hydro.locales[lang].__id;
        if (id) localeList[id] = { name: global.Hydro.locales[lang].__langname, flag: global.Hydro.locales[lang].__flag };
    }
    addFile('locale-list.js', `window.HydroLocaleList=${JSON.stringify(localeList)};`);
}

async function buildCodeLangs() {
    addFile('code-langs.js', `window.HydroCodeLangs=${JSON.stringify(SettingModel.langs)};`);
}

async function buildVersions() {
    const versions: Record<string, string> = { ...global.Hydro.version };
    try {
        const { simpleGit } = require('simple-git') as typeof import('simple-git');
        const fetchAddonVersion = async (name: string, addonPath: string) => {
            try {
                const git = simpleGit(addonPath);
                const [log, status] = await Promise.all([git.log(), git.status()]);
                if (log.all.length > 0) {
                    let hash = log.all[0].hash.substring(0, 7);
                    if (!status.isClean()) hash += '-dirty';
                    versions[name] = versions[name] ? `${versions[name]}-${hash}` : hash;
                }
            } catch (e) {
                logger.debug('Could not get git hash for addon %s: %o', name, e);
            }
        };
        await Promise.all(
            Object.entries(global.addons)
                .filter(([name]) => name !== 'hydrooj') // already handled in loader.ts
                .map(([name, addonPath]) => fetchAddonVersion(name, addonPath as string)),
        );
    } catch (e) {
        logger.debug('simple-git not available: %o', e);
    }
    addFile('versions.js', `window.HydroVersions=${JSON.stringify(versions)};`);
}

class UiNextConstantHandler extends Handler {
    noCheckPermView = true;

    @param('name', Types.Filename)
    async all(domainId: string, name: string) {
        if (!(name in vfs)) throw new NotFoundError(name);
        this.response.type = 'application/javascript';
        this.response.body = vfs[name];
        this.response.addHeader('ETag', hashes[name]);
        this.response.addHeader('Cache-Control', 'public, max-age=86400');
    }
}

function getPluginBuildOptions(entries: Record<string, string>): esbuild.BuildOptions {
    return {
        stdin: {
            contents: [
                ...Object.entries(entries).map(([_, e], i) => `import * as plugin${i} from '${e}';`),
                `window.__hydroPlugins = [${Object.entries(entries).map(([n], i) => `{ name: '${n}', ...plugin${i} }`).join(', ')}];`,
            ].join('\n'),
            sourcefile: 'plugins.ts',
            resolveDir: process.cwd(),
            loader: 'ts',
        },
        bundle: true,
        format: 'esm',
        write: false,
        target: ['chrome90'],
        plugins: [federationPlugin],
        jsx: 'automatic',
        jsxImportSource: 'react',
    };
}

export async function buildPlugins() {
    const start = Date.now();
    let totalSize = 0;
    const entries = getAddonEntries();

    const newPluginFiles = new Set<string>();
    const emit = (name: string, content: string) => {
        addFile(name, content);
        newPluginFiles.add(name);
    };
    const purge = () => {
        for (const key of Object.keys(vfs)) {
            if (!newPluginFiles.has(key)) {
                delete vfs[key];
                delete hashes[key];
            }
        }
    };

    try {
        if (!Object.keys(entries).length) {
            emit('plugins.js', 'window.__hydroPlugins = [];');
            purge();
            logger.info('No plugins to build');
            return;
        }

        const result = await esbuild.build({
            ...getPluginBuildOptions(entries),
            splitting: true,
            outdir: 'plugins-dist',
            entryNames: 'plugins',
            chunkNames: 'chunk-[hash]',
            assetNames: 'asset-[hash]',
            metafile: true,
            minify: true,
        });
        if (result.errors.length) logger.error('Plugin build errors: %o', result.errors);

        const cssText = new Map<string, string>();
        for (const f of result.outputFiles) {
            if (f.path.endsWith('.css')) cssText.set(f.path, f.text);
        }

        const cssForJs = new Map<string, string>();
        const claimed = new Set<string>();
        for (const [rel, meta] of Object.entries(result.metafile.outputs)) {
            if (!meta.cssBundle) continue;
            const css = path.resolve(meta.cssBundle);
            cssForJs.set(path.resolve(rel), css);
            claimed.add(css);
        }

        let unclaimedCss = '';
        for (const [abs, text] of cssText) {
            if (!claimed.has(abs)) unclaimedCss += text;
        }

        for (const f of result.outputFiles) {
            if (f.path.endsWith('.css')) continue;

            const name = path.basename(f.path);
            let content = f.text;

            const css = cssText.get(cssForJs.get(f.path) ?? '');
            if (css) content = applyCss(css) + content;
            if (name === 'plugins.js' && unclaimedCss) content = applyCss(unclaimedCss) + content;

            totalSize += content.length;
            emit(name, content);
        }

        purge();
        logger.success('Plugins built in %dms (%d entries, %s)', Date.now() - start, Object.keys(entries).length, size(totalSize));
    } catch (e) {
        logger.error('Plugin build failed: %o', e);
    }
}

const HASH_FALLBACK = '00000000';

const getViewLang = (handler: HandlerCommon) => handler.user?.viewLang || handler.session?.viewLang || 'zh';

const injectedScripts = (resolve: (name: string) => string, viewLang: string) => [
    'code-langs.js',
    'locale-list.js',
    `lang-${viewLang}.js`,
    'versions.js',
].map((name) => `<script src="${resolve(name)}"></script>`);

function injectPage(ctx: Context, handler: Handler, html: string, assetUrl: (name: string) => string, pluginsUrl?: string) {
    const serialized = JSON.stringify({
        HYDRO_INJECTED: true,
        name: handler.context._matchedRouteName,
        args: {
            UserContext: handler.user,
            UiContext: handler.UiContext,
            ...handler.response.body,
        },
        url: handler.context.req.url!,
        route_map: ctx.server.routeMap,
        endpoint: ctx.setting.get('server.url') || undefined,
        plugins_url: pluginsUrl,
    }, serializer(false, handler)).replaceAll('<', '\\u003c');
    const injectHtml = [
        buildInject(serialized),
        ...injectedScripts(assetUrl, getViewLang(handler)),
    ].join('\n');
    return html.replace(INJECT_MARKER, injectHtml);
}

const uiNextLayer = (render: (handler: Handler) => string | Promise<string>) => async (ctx: KoaContext, next: Next) => {
    await next();
    const handler: Handler = ctx.handler;
    if (!handler?.useUiNext || handler.request.websocket) return;

    const { request, response } = handler;
    response.addHeader('x-hydro-ui-next', 'true');
    if (ctx.cors) ctx.append('Access-Control-Expose-Headers', 'x-hydro-page, x-hydro-ui-next');
    if (request.json || request.query.noTemplate || response.type || response.redirect || response.body === null) return;

    response.body = await render(handler);
    response.type = 'text/html';
};

const SupportedHandlers = [
    'HomeHandler',
    'ProblemMainHandler',
];

export async function apply(ctx: Context) {
    if (process.env.HYDRO_CLI) return;

    for (const name of SupportedHandlers) {
        ctx.withHandlerClass(name, (HandlerClass) => {
            ctx.effect(() => {
                const original = Object.getOwnPropertyDescriptor(HandlerClass.prototype, 'useUiNext');
                HandlerClass.prototype.useUiNext = true;
                return () => {
                    if (original) Object.defineProperty(HandlerClass.prototype, 'useUiNext', original);
                    else delete HandlerClass.prototype.useUiNext;
                };
            });
        });
    }
    ctx.Route('ui_next_constants', '/plugins/:version/:name', UiNextConstantHandler);

    if (process.env.DEV) {
        const buildDev = async () => {
            await buildI18n();
            await buildCodeLangs();
            await buildVersions();
        };
        ctx.on('app/started', buildDev);
        ctx.on('app/i18n/update', buildI18n);
        ctx.on('system/setting-loaded', buildCodeLangs);
        ctx.on('system/setting', buildCodeLangs);

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
        ctx.server.addHandlerLayer('ui-next', uiNextLayer(async (handler) => {
            const ts = Date.now();
            const devAssetUrl = (name: string) => `/plugins/0/${name}?_=${ts}`;
            const htmlToRender = injectPage(ctx, handler, html, devAssetUrl);
            return vite.transformIndexHtml(handler.context.req.url!, htmlToRender);
        }));

        // eslint-disable-next-line consistent-return
        return async () => {
            await vite.close().catch((e) => console.error(e));
        };
    } else {
        const build = async () => {
            await buildPlugins();
            await buildI18n();
            await buildCodeLangs();
            await buildVersions();
        };
        const debouncedBuild = ctx.debounce(build, 2000);
        const triggerHotUpdate = (filePath?: string) => {
            if (filePath && !filePath.includes('/ui/') && !filePath.includes('/ui-next/')) return;
            debouncedBuild();
        };

        ctx.on('app/started', build);

        ctx.server.addHandlerLayer('ui-next', uiNextLayer((handler) => {
            const indexHtml = path.join(__dirname, 'public', 'index.html');
            if (!fs.existsSync(indexHtml)) return PENDING_HTML;
            const html = fs.readFileSync(indexHtml, 'utf-8');
            const prodAssetUrl = (name: string) => `/plugins/${hashes[name] || HASH_FALLBACK}/${name}`;
            return injectPage(ctx, handler, html, prodAssetUrl, prodAssetUrl('plugins.js'));
        }));
        ctx.on('app/watch/change', triggerHotUpdate);
        ctx.on('app/watch/unlink', triggerHotUpdate);
        ctx.on('system/setting-loaded', buildCodeLangs);
        ctx.on('system/setting', debouncedBuild);
        ctx.on('app/i18n/update', debouncedBuild);
    }
}
