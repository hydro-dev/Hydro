export default async function loadExternalModule(target: string) {
  const ele = document.createElement('script');
  ele.src = target;
  await new Promise((resolve, reject) => {
    ele.onload = resolve;
    ele.onerror = reject;
    document.head.appendChild(ele);
  });
  return window.exports;
}
