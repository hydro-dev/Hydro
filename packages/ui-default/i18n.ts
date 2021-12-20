import { setLocaleData } from 'vj/components/monaco/nls';

export default async function load() {
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
}
