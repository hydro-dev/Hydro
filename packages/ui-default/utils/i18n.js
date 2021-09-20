import substitute from './substitute';

export default function i18n(str, ...params) {
  return substitute(window.LOCALES?.[str] || str, params);
}

window.Hydro.utils.i18n = i18n;
