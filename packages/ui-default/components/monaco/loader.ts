import { getFeatures, load as loadModule } from '../../lazyload';

/* eslint-disable no-await-in-loop */

let loaded;

const localeLoader: Partial<Record<string, () => Promise<void>>> = {
  ko: async () => {
    await import('@codingame/monaco-vscode-language-pack-ko');
  },
  zh: async () => {
    await import('@codingame/monaco-vscode-language-pack-zh-hans');
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  'zh_TW': async () => {
    await import('@codingame/monaco-vscode-language-pack-zh-hant');
  },
};

const val: Record<string, any> = {};
/** @deprecated */
async function legacyLoadExternalModule(target: string) {
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
  // workbench: async () => {
  //   await Promise.all([
  //     import('@codingame/monaco-vscode-theme-seti-default-extension'),
  //     import('@codingame/monaco-vscode-media-preview-default-extension'),
  //     import('@codingame/monaco-vscode-markdown-language-features-default-extension'),
  //     import('@codingame/monaco-vscode-markdown-math-default-extension'),
  //     import('@codingame/monaco-vscode-configuration-editing-default-extension'),
  //     import('@codingame/monaco-editor-wrapper/features/viewPanels'),
  //     import('@codingame/monaco-editor-wrapper/features/search'),
  //   ]);
  // },
  markdown: async () => await Promise.all([
    import('./languages/markdown'),
    import('@codingame/monaco-vscode-markdown-basics-default-extension'),
    import('@codingame/monaco-vscode-markdown-language-features-default-extension'),
    import('@codingame/monaco-vscode-markdown-math-default-extension'),
  ]),
  // typescript: async () => await import('@codingame/monaco-vscode-typescript-language-features-default-extension'), // 15.3 MiB Compressed
  cpp: async () => await import('@codingame/monaco-vscode-cpp-default-extension'),
  yaml: async () => await import('@codingame/monaco-vscode-yaml-default-extension'),
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

let loadPromise = localeLoader.zh();
let config = false;

async function initConfigManager(t: typeof import('./monaco.ts')) {
  t.registerFile(new t.RegisteredMemoryFile(t.default.Uri.parse('/.vscode/settings.json'), localStorage.getItem('monaco.settings') || '{}'));
  const model = await t.default.editor.createModelReference(t.default.Uri.parse('/.vscode/settings.json'));
  model.object.textEditorModel?.onDidChangeContent(() => {
    const value = model.object.textEditorModel?.getValue() || '{}';
    localStorage.setItem('monaco.settings', value);
    t.updateUserConfiguration(value);
  });
}

export async function load(features = ['markdown']) {
  let s = Date.now();
  await loadPromise;
  let resolve;
  loadPromise = new Promise((r) => { resolve = r; });
  if (!loaded) console.log('Loading monaco editor');
  const res = await import('./monaco');
  if (!loaded) {
    await res.init(features.includes('workbench'));
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
  if (!config) {
    config = true;
    await initConfigManager(res);
  }
  resolve();
  return { ...res, monaco: res.default };
}

export default load;
window.Hydro.components.loadMonaco = load;
