const lazyModules = {};
const features: Record<string, string | (() => Promise<any>)> = {};
export default async function load(name: string) {
  if (name === 'echarts') return import('echarts');
  if (name === 'moment') return import('moment');
  if (!window.lazyloadMetadata?.[`${name}.lazy.js`]) throw new Error(`Module ${name} not found`);
  if (lazyModules[name]) return lazyModules[name];
  const tag = document.createElement('script');
  tag.src = `/lazy/${window.lazyloadMetadata[`${name}.lazy.js`]}/${name}.lazy.js`;
  console.log('loading module: ', name);
  lazyModules[name] = new Promise((resolve, reject) => {
    tag.onerror = reject;
    const timeout = setTimeout(reject, 30000);
    window.lazyModuleResolver[name] = (item) => {
      clearTimeout(timeout);
      resolve(item);
    };
  });
  document.body.appendChild(tag);
  return lazyModules[name];
}

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

export { load };
export async function getFeatures(name: string) {
  const legacy = Object.keys(window.externalModules).filter((i) => i === name || i.startsWith(`${name}@`))
    .map((i) => window.externalModules[i]);
  const c = Object.keys(features).filter((i) => i === name || i.startsWith(`${name}@`))
    .map((i) => features[i]);
  console.log('query features for:', name, 'legacy:', legacy, 'selected:', c, 'all:', features);
  return c.concat(legacy);
}

export const loaded = [];
export async function loadFeatures(name: string, ...args: any[]) {
  if (loaded.includes(name)) return;
  loaded.push(name);
  for (const item of await getFeatures(name)) {
    let apply = typeof item === 'function'
      ? item
      : (item.startsWith('http') || item.startsWith('/'))
        ? await legacyLoadExternalModule(item)
        : (await load(item)).apply;
    if (typeof apply !== 'function') apply = apply.default || apply.apply;
    if (typeof apply === 'function') await apply(...args);
  }
}

export function provideFeature(name: string, content: string | (() => Promise<any>)) {
  console.debug('Providing feature', name);
  if (features[name]) console.warn('Feature', name, 'already provided');
  features[name] = content;
  if (loaded.includes(name)) console.warn('Feature', name, 'already loaded');
}
