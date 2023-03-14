function format(message, args) {
  let result;
  if (!args.length) result = message;
  else {
    result = String(message).replace(/\{(\d+)\}/g, (match, rest) => {
      const index = rest[0];
      return typeof args[index] !== 'undefined' ? args[index] : match;
    });
  }
  return result;
}

export const getConfiguredDefaultLocale = () => 'zh';

let CURRENT_LOCALE_DATA = {}; // eslint-disable-line @typescript-eslint/naming-convention

export function localize(path, message, ...args) {
  return format(CURRENT_LOCALE_DATA[path.key || path] || message, args);
}

export function setLocaleData(data) {
  CURRENT_LOCALE_DATA = Object.assign(...Object.values(data));
}

export function loadMessageBundle() {
  return localize;
}

export function config() {
  return loadMessageBundle;
}
