/* eslint-disable github/array-foreach */
import {
  $, addPage, AutoloadPage, request,
} from '@hydrooj/ui-default';

/* global DocsAPI */

let loaded = false;
async function load() {
  if (loaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const scriptElement = document.createElement('script');
    scriptElement.src = UiContext.onlyofficeApi;
    scriptElement.async = true;
    document.head.appendChild(scriptElement);
    scriptElement.onload = resolve;
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
  if (all.length) await load();
  getEles(['doc', 'docx']).forEach(loader('word'));
  getEles(['cell', 'xls', 'xlsx']).forEach(loader('cell'));
  getEles(['slide', 'ppt', 'pptx']).forEach(loader('slide'));
  getEles(['pdf']).forEach(loader('pdf'));
}));
