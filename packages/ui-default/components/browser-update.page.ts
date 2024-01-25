import { AutoloadPage } from 'vj/misc/Page';
import { i18n, tpl } from 'vj/utils';
import { InfoDialog } from './dialog';

function isSupported() {
  try {
    if (!navigator.userAgent.includes('Chrome/')) return false;
    const ver = +navigator.userAgent.split('Chrome/')[1].split('.')[0];
    if (!Number.isSafeInteger(ver)) return false;
    if (ver < 80) return false;
    return true;
  } catch (e) {
    return false;
  }
}

export default new AutoloadPage('browser-update', () => {
  if (UserContext.priv !== -1) return; // Only warn superadmins
  if ((+localStorage.getItem('su-browser-warn') || 0) - Date.now() < 24 * 3600 * 1000) return;
  const key = 'warn::admin:unsupportedbrowser';
  if (!isSupported() && i18n(key) !== key) {
    new InfoDialog({
      $body: tpl.typoMsg(i18n(key)),
    }).open();
    localStorage.setItem('su-browser-warn', Date.now().toString());
  }
});
