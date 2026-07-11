import { getFeatures, load as loadModule } from '../../lazyload';

let loaded;

const val: Record<string, any> = {};
/** @deprecated */
export async function legacyLoadExternalModule(target: string) {
  if (val[target]) return val[target];
  const ele = document.createElement('script');
  ele.src = target;
  await new Promise((resolve, reject) => {
    ele.onload = resolve;
    ele.onerror = reject;
    document.head.appendChild(ele);
  });
  val[target] = window.exports;
  return val[target];
}

const loaders = {
  i18n: async () => {
    const { setLocaleData } = await import('./nls');
    let resource;
    const lang = UserContext.viewLang;
    if (lang === 'zh') {
      resource = await import('monaco-editor-nls/locale/zh-hans.json');
    } else if (lang === 'zh_TW') {
      resource = await import('monaco-editor-nls/locale/zh-hant.json');
    } else if (lang === 'ko') {
      resource = await import('monaco-editor-nls/locale/ko.json');
    }
    if (resource) setLocaleData(resource);
  },
  markdown: () => import('./languages/markdown'),
  typescript: () => import('./languages/typescript').then((m) => m.loadTypes()),
  yaml: () => import('./languages/yaml'),
  external: async (monaco, feat) => {
    for (const item of await getFeatures(`monaco-${feat}`)) {
      let apply = typeof item === 'function'
        ? item
        : (item.startsWith('http') || item.startsWith('/'))
          ? await legacyLoadExternalModule(item)
          : (await loadModule(item)).apply;
      if (typeof apply !== 'function') apply = apply.default || apply.apply;
      if (typeof apply === 'function') await apply(monaco);
    }
  },
};

let loadPromise = Promise.resolve();

export async function load(features = ['markdown']) {
  let s = Date.now();
  await loadPromise;
  let resolve;
  loadPromise = new Promise((r) => { resolve = r; });
  if (!loaded) {
    await loaders.i18n();
    console.log('Loading monaco editor');
  }
  const res = await import('./index');
  if (!loaded) {
    console.log('Loaded monaco editor in', Date.now() - s, 'ms');
    loaded = [];
  }
  for (const feat of features) {
    if (loaded.includes(feat)) continue;
    if (!loaders[feat]) {
      const items = await getFeatures(`monaco-${feat}`);
      if (!items.length) {
        console.warn('Unknown monaco feature:', feat);
        continue;
      }
    }
    s = Date.now();
    console.log('Loading monaco feature:', feat);
    try {
      if (loaders[feat]) await loaders[feat]();
      else await loaders.external(res.default, feat);
      console.log('Loaded monaco feature:', feat, 'in', Date.now() - s, 'ms');
      loaded.push(feat);
    } catch (e) {
      console.log('Monaco feat', feat, 'failed to load:', e);
    }
  }
  await res.loadThemePromise;
  resolve();
  return {
    monaco: res.default,
    registerAction: res.registerAction,
    customOptions: res.customOptions,
    renderMarkdown: res.renderMarkdown,
  };
}

export default load;
