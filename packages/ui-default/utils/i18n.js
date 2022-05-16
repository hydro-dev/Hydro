import substitute from './substitute';

export default function i18n(str, ...params) {
  if (!str) return '';
  return substitute(window.LOCALES?.[str] || str, params);
}

window.Hydro.utils.i18n = i18n;
