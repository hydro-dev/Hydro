export { getNLSLanguage, getNLSMessages } from 'monaco-editor/esm/vs/nls.messages';

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

let CURRENT_LOCALE_DATA = {}; // eslint-disable-line ts/naming-convention

export function localize(path, message, ...args) {
  return format(CURRENT_LOCALE_DATA[path.key || path] || CURRENT_LOCALE_DATA[message] || message, args);
}

export function localize2(data, message, ...args) {
  const original = localize(data, message, args);
  return {
    value: original,
    original,
  };
}

export function setLocaleData(data) {
  CURRENT_LOCALE_DATA = Object.assign(...Object.values(data));
}
