/* eslint-disable github/array-foreach */
import {
  $, addPage, AutoloadPage, i18n, Notification, request,
} from '@hydrooj/ui-default';
/* global DocsAPI */

let loaded = false;
function load(): Promise<boolean> {
  if (loaded) return Promise.resolve(true);
  if (!UiContext.onlyofficeApi) {
    console.error('Onlyoffice api not set');
    Notification.error(i18n('onlyoffice.not_configured'));
    return Promise.resolve(false);
  }
  return new Promise((resolve, reject) => {
    const scriptElement = document.createElement('script');
    scriptElement.src = UiContext.onlyofficeApi;
    scriptElement.async = true;
    document.head.appendChild(scriptElement);
    scriptElement.onload = () => resolve(true);
    scriptElement.onerror = reject;
    loaded = true;
  });
}

const loader = (mode) => async (element) => {
  const id = `${mode}-${Math.random().toString()}`;
  $(element).attr('id', id);
  const url = new URL($(element).text(), window.location.href).toString();
  try {
    const payload = await request.get('/onlyoffice-jwt', { url });
    // @ts-ignore
    window.editor = new DocsAPI.DocEditor(id, {
      ...payload,
      documentType: mode,
      height: mode === 'slide' ? '560px' : '900px',
    });
  } catch (e) {
    console.error(e);
  }
};

const getEles = (types: string[]) => types.flatMap((type) => $(`div[data-${type}]`).get());

addPage(new AutoloadPage('onlyoffice', async () => {
  const all = getEles(['doc', 'docx', 'cell', 'xls', 'xlsx', 'slide', 'ppt', 'pptx', 'pdf']);
  if (!all.length) return;
  try {
    const result = await load();
    if (!result) return;
    getEles(['doc', 'docx']).forEach(loader('word'));
    getEles(['cell', 'xls', 'xlsx']).forEach(loader('cell'));
    getEles(['slide', 'ppt', 'pptx']).forEach(loader('slide'));
    getEles(['pdf']).forEach(loader('pdf'));
  } catch (e) {
    console.error(`Failed to initialize onlyoffice: ${e.message}`);
    Notification.error(i18n('onlyoffice.inialize_fail', e.message));
  }
}));
