import Clipboard from 'clipboard';
import $ from 'jquery';
import { nanoid } from 'nanoid';
import { ActionDialog, InfoDialog } from 'vj/components/dialog/index';
import Notification from 'vj/components/notification';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n, request, tpl } from 'vj/utils';
import uploadFiles from '../upload';

async function startEdit(filename, value, fileCategory = 'file') {
  const { default: Editor } = await import('vj/components/editor/index');
  const promise = new ActionDialog({
    $body: tpl`
      <div class="typo" style="width: 100%; height: 100%">
        <textarea name="fileContent" style="width: 100%; height: 100%"></textarea>
      </div>`,
    width: `${window.innerWidth - 200}px`,
    height: `${window.innerHeight - 100}px`,
    cancelByEsc: false,
  }).open();
  const languages = [
    ['yaml', ['yaml', 'yml']],
    ['cpp', ['c', 'cc', 'cpp', 'h', 'hpp']],
    ['json', ['json']],
    ['plain', ['in', 'out', 'ans']],
  ];
  const language = languages.filter((i) => i[1].includes(filename.split('.').pop()))[0]?.[0] || 'auto';
  const editor = new Editor($('[name="fileContent"]'), {
    value,
    autoResize: false,
    autoLayout: false,
    language: (language as string),
    model: `hydro://problem/${fileCategory}/${filename}`,
  });
  const action = await promise;
  value = (editor.value() as string).replace(/\r\n/g, '\n');
  editor.destroy();
  if (action !== 'ok') return null;
  return value;
}

const dialogAction = (id) => [
  tpl`<button class="rounded button" data-action="copy" id="copy-${id}">${i18n('Copy Link')}</button>`,
  tpl`<button class="rounded button" data-action="download">${i18n('Download')}</button>`,
  tpl`<button class="primary rounded button" data-action="ok">${i18n('Ok')}</button>`,
];

function bindCopyLink(id, src: string) {
  const url = !['file', 'files'].some((i) => window.location.href.endsWith(i))
    || ['homework', 'training'].some((i) => window.location.href.match(`${i}/.*/file`))
    ? `file://${src.substring(src.lastIndexOf('/') + 1)}` : src;
  const clip = new Clipboard(`#copy-${id}`, { text: () => `${url}` });
  clip.on('success', () => Notification.success(i18n(`${url.startsWith('file://') ? 'Reference' : 'Download'} link copied to clipboard!`)));
  clip.on('error', () => Notification.error(i18n('Copy failed :(')));
}

async function previewVideo(link) {
  const id = nanoid();
  const dialog = new InfoDialog({
    $body: tpl`
    <div class="typo"><video width="100%" controls>
      <source src="${link}" type="${link.endsWith('ogg') ? 'video/ogg' : 'video/mp4'}">
      Your browser doesn't support video tag.
    </video></div>`,
    $action: dialogAction(id),
  });
  bindCopyLink(id, link);
  const action = await dialog.open();
  if (action === 'download') window.open(link);
}

async function previewImage(link) {
  const id = nanoid();
  const dialog = new InfoDialog({
    $body: tpl`<div class="typo"><img src="${link}" style="max-height: calc(80vh - 45px);"></img></div>`,
    $action: dialogAction(id),
  });
  bindCopyLink(id, link);
  const action = await dialog.open();
  if (action === 'download') window.open(link);
}

async function previewPDF(link) {
  const uuidURL = URL.createObjectURL(new Blob());
  const uuid = uuidURL.toString();
  URL.revokeObjectURL(uuidURL);
  const id = nanoid();
  const dialog = new InfoDialog({
    $body: tpl`
      <div class="typo" style="height: 100%;">
        <object classid="clsid:${(uuid.substring(uuid.lastIndexOf('/') + 1))}">
          <param name="SRC" value="${link}" >
          <embed width="100%" style="height: 100%;border: none;" src="${link}">
            <noembed></noembed>
          </embed>
        </object>
      </div>`,
    width: `${window.innerWidth - 200}px`,
    height: `${window.innerHeight - 100}px`,
    $action: dialogAction(id),
  });
  bindCopyLink(id, link);
  const action = await dialog.open();
  if (action === 'download') window.open(link);
}

async function previewOffice(link, src) {
  const id = nanoid();
  const dialog = new InfoDialog({
    $body: tpl`
      <div class="typo">
        <iframe src="https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(new URL(src, window.location.href).toString())}"
          scrolling="no" border="0" frameborder="no" framespacing="0" width="100%" style="height: 70vh;"></iframe>
      </div>`,
    width: `${window.innerWidth - 200}px`,
    height: `${window.innerHeight - 100}px`,
    $action: dialogAction(id),
  });
  bindCopyLink(id, link);
  const action = await dialog.open();
  if (action === 'download') window.open(link);
}

export async function previewFile(ev?, type = '') {
  if (ev?.metaKey || ev?.ctrlKey || ev?.shiftKey) return null;
  if (ev) ev.preventDefault();
  const filename = ev
    ? ev.currentTarget.closest('[data-filename]').getAttribute('data-filename')
    // eslint-disable-next-line no-alert
    : prompt(i18n('Filename'));
  if (!filename) return null;
  const filesize = ev
    ? +ev.currentTarget.closest('[data-size]').getAttribute('data-size')
    : 0;
  let content = '';
  if (ev) {
    const link = $(ev.currentTarget).find('a').attr('href');
    if (!link) return null;
    type ||= ev.currentTarget.getAttribute('data-preview');
    const ext = filename.split('.').pop().toLowerCase();
    if (['zip', 'rar', '7z'].includes(ext) || filesize > 8 * 1024 * 1024) {
      const id = nanoid();
      const dialog = new ActionDialog({
        $body: tpl.typoMsg(i18n('Cannot preview this file. Download now?')),
        $action: [
          tpl`<button class="rounded button" data-action="copy" id="copy-${id}">${i18n('Copy Link')}</button>`,
          tpl`<button class="rounded button" data-action="cancel">${i18n('Cancel')}</button>`,
          tpl`<button class="primary rounded button" data-action="ok">${i18n('Ok')}</button>`,
        ],
      });
      bindCopyLink(id, link);
      const action = await dialog.open();
      if (action === 'ok') window.open(link);
      return null;
    }
    if (['mp4', 'webm', 'ogg'].includes(ext)) return previewVideo(link);
    if (['png', 'jpeg', 'jpg', 'gif', 'webp', 'bmp'].includes(ext)) return previewImage(link);
    if (ext === 'pdf') return previewPDF(`${link}${link.includes('?') ? '&' : '?'}noDisposition=1`);
    Notification.info(i18n('Loading file...'));
    try {
      const { url } = await request.get(link, {}, { headers: { Pragma: 'no-cache' } });
      if (/^(?:doc|xls|ppt)x?$/.test(ext)) return previewOffice(link, url);
      content = await request.get(url, undefined, { dataType: 'text' });
    } catch (e) {
      Notification.error(i18n('Failed to load file: {0}', e.message));
      throw e;
    }
  } else Notification.info(i18n('Loading editor...'));
  const val = await startEdit(filename, content, type || 'file');
  if (typeof val !== 'string') return null;
  const file = new File([val], filename, { type: 'text/plain' });
  const endpoint = new URL(!window.location.href.endsWith('/files')
    ? `${window.location.href.substring(0, window.location.href.lastIndexOf('/'))}/files` : '', window.location.href);
  const sidebarType = type || $(ev.currentTarget).closest('[data-fragment-id]').data('type');
  const sidebar = ev && $(ev.currentTarget).closest('[data-fragment-id]').data('sidebar') !== undefined;
  await uploadFiles(endpoint.toString(), [file], {
    type: sidebarType || type,
    sidebar,
    pjax: true,
  });
  return null;
}

const dataPreviewPage = new AutoloadPage('dataPreview', () => {
  $(document).on('click', '[data-preview]', previewFile);
});

window.Hydro.components.preview = { startEdit, previewFile };
export default dataPreviewPage;
