let loaded;
const loaders = {
  i18n: async () => {
    const { setLocaleData } = await import('vj/components/monaco/nls');
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
  typescript: () => import('./languages/typescript'),
  yaml: () => import('./languages/yaml'),
};

export async function load(features = ['markdown']) {
  let s = Date.now();
  if (!loaded) {
    await loaders.i18n();
    console.log('Loading monaco editor');
  }
  const res = await import('./index');
  if (!loaded) {
    console.log('Loaded monaco editor in ', Date.now() - s, 'ms');
    loaded = [];
  }
  for (const feat of features) {
    if (loaded.includes(feat)) continue;
    if (!loaders[feat]) {
      console.error('Unknown monaco feature:', feat);
      continue;
    }
    s = Date.now();
    console.log('Loading monaco feature:', feat);
    await loaders[feat]();
    console.log('Loaded monaco feature:', feat, 'in', Date.now() - s, 'ms');
    loaded.push(feat);
  }
  return { monaco: res.default, registerAction: res.registerAction };
}
export default load;
