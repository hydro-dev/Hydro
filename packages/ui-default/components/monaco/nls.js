/* eslint-disable camelcase */
import en_GB from 'monaco-editor-nls/locale/en-gb.json';

function _format(message, args) {
  let result;
  if (args.length === 0) {
    result = message;
  } else {
    result = String(message).replace(/\{(\d+)\}/g, (match, rest) => {
      const index = rest[0];
      return typeof args[index] !== 'undefined' ? args[index] : match;
    });
  }
  return result;
}

let CURRENT_LOCALE_DATA = {};

function find(path, message) {
  for (const key of Object.keys(CURRENT_LOCALE_DATA)) {
    if (!CURRENT_LOCALE_DATA[key] || !en_GB[key]) continue;
    if (CURRENT_LOCALE_DATA[key][path] && en_GB[key][path] === message) {
      return CURRENT_LOCALE_DATA[key][path];
    }
  }
  for (const key of Object.keys(CURRENT_LOCALE_DATA)) {
    if (!CURRENT_LOCALE_DATA[key]) continue;
    if (CURRENT_LOCALE_DATA[key][path]) {
      return CURRENT_LOCALE_DATA[key][path];
    }
  }
  return message;
}

export function localize(path, message, ...args) {
  return _format(find(path.key || path, message), args);
}

export function setLocaleData(data) {
  CURRENT_LOCALE_DATA = data;
}

export function loadMessageBundle(file) {
  return localize;
}

export function config(opt) {
  return loadMessageBundle;
}
