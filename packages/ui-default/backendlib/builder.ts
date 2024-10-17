import esbuild from 'esbuild';
import {
  Context, fs, Handler, Logger, NotFoundError, param, SettingModel, sha1,
  size, SystemModel, Types, UiContextBase,
} from 'hydrooj';
import { debounce } from 'lodash';
import { tmpdir } from 'os';
import {
  basename, join, relative, resolve,
} from 'path';

declare module 'hydrooj' {
  interface UI {
    esbuildPlugins?: esbuild.Plugin[]
  }
  interface SystemKeys {
    'ui-default.nav_logo_dark': string;
  }
  interface UiContextBase {
    constantVersion?: string;
  }
}

const vfs: Record<string, string> = {};
const hashes: Record<string, string> = {};
const logger = new Logger('ui');
const tmp = tmpdir();

const federationPlugin: esbuild.Plugin = {
  name: 'federation',
  setup(b) {
    b.onResolve({ filter: /^@hydrooj\/ui-default/ }, () => ({
      path: 'api',
      namespace: 'ui-default',
    }));
    b.onLoad({ filter: /.*/, namespace: 'ui-default' }, () => ({
      contents: 'module.exports = window.HydroExports;',
      loader: 'tsx',
    }));
  },
};

const build = async (contents: string) => {
  const res = await esbuild.build({
    tsconfigRaw: '{"compilerOptions":{"experimentalDecorators":true}}',
    format: 'iife' as 'iife',
    bundle: true,
    outdir: tmp,
    sourcemap: SystemModel.get('ui-default.nosourcemap') ? false : 'external',
    splitting: false,
    write: false,
    target: ['chrome65'],
    plugins: [
      ...(global.Hydro.ui.esbuildPlugins || []),
      federationPlugin,
    ],
    minify: !process.env.DEV,
    stdin: {
      contents,
      sourcefile: 'stdin.ts',
      resolveDir: tmp,
      loader: 'ts',
    },
  });
  if (res.errors.length) console.error(res.errors);
  if (res.warnings.length) console.warn(res.warnings);
  return res;
};

export async function buildUI() {
  const start = Date.now();
  let totalSize = 0;
  const entryPoints: string[] = [];
  const lazyModules: string[] = [];
  const newFiles = ['entry.js'];
  for (const addon of global.addons) {
    let publicPath = resolve(addon, 'frontend');
    if (!fs.existsSync(publicPath)) publicPath = resolve(addon, 'public');
    if (!fs.existsSync(publicPath)) continue;
    const targets = fs.readdirSync(publicPath);
    for (const target of targets) {
      if (/\.page\.[jt]sx?$/.test(target)) entryPoints.push(join(publicPath, target));
      if (/\.lazy\.[jt]sx?$/.test(target)) lazyModules.push(join(publicPath, target));
    }
  }
  function addFile(name: string, content: string) {
    vfs[name] = content;
    hashes[name] = sha1(content).substring(0, 8);
    logger.info('+ %s-%s: %s', name, hashes[name].substring(0, 6), size(content.length));
    newFiles.push(name);
    totalSize += content.length;
  }
  for (const m of lazyModules) {
    const name = basename(m).split('.')[0];
    const { outputFiles } = await build(`window.lazyModuleResolver['${name}'](require('${relative(tmp, m).replace(/\\/g, '\\\\')}'))`);
    for (const file of outputFiles) {
      addFile(basename(m).replace(/\.[tj]sx?$/, '.js'), file.text);
    }
  }
  for (const lang in global.Hydro.locales) {
    if (!/^[a-zA-Z_]+$/.test(lang)) continue;
    const str = `window.LOCALES=${JSON.stringify(global.Hydro.locales[lang][Symbol.for('iterate')])};`;
    addFile(`lang-${lang}.js`, str);
  }
  const entry = await build([
    `window.lazyloadMetadata = ${JSON.stringify(hashes)};`,
    `window.LANGS=${JSON.stringify(SettingModel.langs)};`,
    ...entryPoints.map((i) => `import '${relative(tmp, i).replace(/\\/g, '\\\\')}';`),
  ].join('\n'));
  const pages = entry.outputFiles.filter((i) => i.path.endsWith('.js')).map((i) => i.text);
  addFile('entry.js', `window._hydroLoad=()=>{ ${pages.join('\n')} };`);
  UiContextBase.constantVersion = hashes['entry.js'];
  for (const key in vfs) {
    if (newFiles.includes(key)) continue;
    delete vfs[key];
    delete hashes[key];
  }
  logger.success('UI addons built in %d ms (%s)', Date.now() - start, size(totalSize));
}

class UiConstantsHandler extends Handler {
  noCheckPermView = true;

  @param('name', Types.Filename, true)
  async all(domainId: string, name: string) {
    this.response.type = 'application/javascript';
    name ||= 'entry.js';
    if (!vfs[name]) throw new NotFoundError(name);
    this.response.addHeader('ETag', hashes[name]);
    this.response.body = vfs[name];
    this.response.addHeader('Cache-Control', 'public, max-age=86400');
  }
}

export async function apply(ctx: Context) {
  ctx.Route('constant', '/constant/:version', UiConstantsHandler);
  ctx.Route('constant', '/lazy/:version/:name', UiConstantsHandler);
  ctx.Route('constant', '/resource/:version/:name', UiConstantsHandler);
  ctx.on('app/started', buildUI);
  const debouncedBuildUI = debounce(buildUI, 2000, { trailing: true });
  const triggerHotUpdate = (path?: string) => {
    if (path && !path.includes('/ui-default/') && !path.includes('/public/') && !path.includes('/frontend/')) return;
    debouncedBuildUI();
  };
  ctx.on('system/setting', () => triggerHotUpdate());
  ctx.on('app/watch/change', triggerHotUpdate);
  ctx.on('app/watch/unlink', triggerHotUpdate);
  ctx.on('app/i18n/update', debouncedBuildUI);
  debouncedBuildUI();
}
