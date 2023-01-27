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
    nav_logo_dark?: string;
    constantVersion?: string;
  }
}

function updateLogo() {
  UiContextBase.nav_logo_dark = SystemModel.get('ui-default.nav_logo_dark');
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
    format: 'iife' as 'iife',
    bundle: true,
    outdir: tmp,
    splitting: false,
    write: false,
    target: ['chrome60'],
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
    const publicPath = resolve(addon, 'public');
    if (!fs.existsSync(publicPath)) continue;
    const targets = fs.readdirSync(publicPath);
    for (const target of targets) {
      if (/\.page\.[jt]sx?$/.test(target)) entryPoints.push(join(publicPath, target));
      if (/\.lazy\.[jt]sx?$/.test(target)) lazyModules.push(join(publicPath, target));
    }
  }
  for (const m of lazyModules) {
    const name = basename(m).split('.')[0];
    const { outputFiles } = await build(`window.lazyModuleResolver['${name}'](require('${relative(tmp, m)}'))`);
    for (const file of outputFiles) {
      const key = basename(m).replace(/\.[tj]sx?$/, '.js');
      vfs[key] = file.text;
      hashes[key] = sha1(file.text).substring(0, 8);
      logger.info('+ %s-%s: %s', key.split('.lazy.')[0], hashes[key].substring(0, 6), size(file.text.length));
      newFiles.push(key);
      totalSize += file.text.length;
    }
  }
  const entry = await build([
    `window.lazyloadMetadata = ${JSON.stringify(hashes)};`,
    ...entryPoints.map((i) => `import '${relative(tmp, i)}';`),
  ].join('\n'));
  const pages = entry.outputFiles.map((i) => i.text);
  const str = `window.LANGS=${JSON.stringify(SettingModel.langs)};${pages.join('\n')}`;
  vfs['entry.js'] = str;
  UiContextBase.constantVersion = hashes['entry.js'] = sha1(str).substring(0, 8);
  logger.info('+ %s-%s: %s', 'entry', hashes['entry.js'].substring(0, 6), size(str.length));
  totalSize += str.length;
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
  ctx.on('app/started', updateLogo);
  ctx.on('app/started', buildUI);
  const debouncedBuildUI = debounce(buildUI, 2000, { trailing: true });
  const triggerHotUpdate = (path?: string) => {
    if (path && !path.includes('/ui-default/') && !path.includes('/public/')) return;
    debouncedBuildUI();
    updateLogo();
  };
  ctx.on('system/setting', () => triggerHotUpdate());
  ctx.on('app/watch/change', triggerHotUpdate);
  ctx.on('app/watch/unlink', triggerHotUpdate);
  debouncedBuildUI();
}
