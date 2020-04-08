import substitute from './substitute';

export default function i18n(str, ...params) {
  if (window.LOCALES && window.LOCALES[str]) {
    return substitute(window.LOCALES[str], params);
  }
  return substitute(str, params);
}
