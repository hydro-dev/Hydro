const loaded = {};

export default async function loadExternalModule(target: string) {
  if (loaded[target]) return loaded[target];
  const ele = document.createElement('script');
  ele.src = target;
  await new Promise((resolve, reject) => {
    ele.onload = resolve;
    ele.onerror = reject;
    document.head.appendChild(ele);
  });
  loaded[target] = window.exports;
  return loaded[target];
}
