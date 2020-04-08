export default function parseQueryString(str) {
  const obj = {};
  (str || document.location.search)
    .replace(/(^\?)/, '')
    .split('&')
    .forEach((n) => {
      const [key, value] = n.split('=').map(v => decodeURIComponent(v));
      obj[key] = value;
    });
  return obj;
}
