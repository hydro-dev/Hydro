const lazyModules = {};
const features: Record<string, string | (() => Promise<any>)> = {};
export default async function load(name: string) {
  if (window.node_modules[name]) return window.node_modules[name];
  if (name === 'echarts') return import('echarts');
  if (name === 'moment') return import('moment');
  if (!window.lazyloadMetadata?.[`${name}.lazy.js`]) throw new Error(`Module ${name} not found`);
  if (lazyModules[name]) return lazyModules[name];
  const tag = document.createElement('script');
  tag.src = `/lazy/${window.lazyloadMetadata[`${name}.lazy.js`]}/${name}.lazy.js`;
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
export { load };
export async function getFeatures(name: string) {
  const legacy = Object.keys(window.externalModules).filter((i) => i === name || i.startsWith(`${name}@`))
    .map((i) => window.externalModules[i]);
  const c = Object.keys(features).filter((i) => i === name || i.startsWith(`${name}@`))
    .map((i) => features[i]);
  console.log(legacy, c, features);
  return c.concat(legacy);
}

export function provideFeature(name: string, content: string | (() => Promise<any>)) {
  features[name] = content;
}
