import Clipboard from 'clipboard';
import $ from 'jquery';
import { ActionDialog, InfoDialog } from 'vj/components/dialog/index';
import Notification from 'vj/components/notification';
import { AutoloadPage } from 'vj/misc/Page';
import i18n from 'vj/utils/i18n';
import pjax from 'vj/utils/pjax';
import request from 'vj/utils/request';
import tpl from 'vj/utils/tpl';

async function startEdit(filename, value) {
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
    model: `hydro://problem/file/${filename}`,
  });
  const action = await promise;
  value = (editor.value() as string).replace(/\r\n/g, '\n');
  editor.destory();
  if (action !== 'ok') return null;
  return value;
}

const dialogAction = [
  tpl`<button class="copybutton rounded button" data-action="copy">${i18n('Copy Link')}</button>`,
  tpl`<button class="rounded button" data-action="download">${i18n('Download')}</button>`,
  tpl`<button class="primary rounded button" data-action="ok">${i18n('Ok')}</button>`,
];

function bindCopyLink(src: string) {
  const url = !(window.location.href.endsWith('file') || window.location.href.endsWith('files')) || window.location.href.match('contest/.*/file')
    ? `file://${src.substring(src.lastIndexOf('/') + 1)}` : src;
  const clip = new Clipboard('.copybutton', { text: () => `${url}` });
  clip.on('success', () => {
    if (!url.startsWith('file://')) {
      Notification.success(i18n('Download link copied to clipboard!'), 1000);
    } else Notification.success(i18n('Reference link copied to clipboard!'), 1000);
    clip.destroy();
  });
  clip.on('error', () => {
    Notification.error(i18n('Copy failed :('));
    clip.destroy();
  });
}

async function previewImage(link) {
  const dialog = new InfoDialog({
    $body: tpl`<div class="typo"><img src="${link}" style="max-height: calc(80vh - 45px);"></img></div>`,
    $action: dialogAction,
  });
  bindCopyLink(link);
  const action = await dialog.open();
  if (action === 'download') window.open(link);
}

async function previewPDF(link, src) {
  const uuidURL = URL.createObjectURL(new Blob());
  const uuid = uuidURL.toString();
  URL.revokeObjectURL(uuidURL);
  const dialog = new InfoDialog({
    $body: tpl`
      <div class="typo">
        <object classid="clsid:${(uuid.substring(uuid.lastIndexOf('/') + 1))}">
          <param name="SRC" value="${src}" >
          <embed width="100%" style="height: 70vh;border: none;" src="${src}">
            <noembed></noembed>
          </embed>
        </object>
      </div>`,
    width: `${window.innerWidth - 200}px`,
    height: `${window.innerHeight - 100}px`,
    $action: dialogAction,
  });
  bindCopyLink(src);
  const action = await dialog.open();
  if (action === 'download') window.open(link);
}

async function previewOffice(link, src) {
  const dialog = new InfoDialog({
    $body: tpl`
      <div class="typo">
        <iframe src="https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(new URL(src, window.location.href).toString())}"
          scrolling="no" border="0" frameborder="no" framespacing="0" width="100%" style="height: 70vh;"></iframe>
      </div>`,
    width: `${window.innerWidth - 200}px`,
    height: `${window.innerHeight - 100}px`,
    $action: dialogAction,
  });
  bindCopyLink(link);
  const action = await dialog.open();
  if (action === 'download') window.open(link);
}

export async function dataPreview(ev, type = '') {
  if (ev?.metaKey || ev?.ctrlKey || ev?.shiftKey) return;
  if (ev) ev.preventDefault();
  const filename = ev
    ? ev.currentTarget.closest('[data-filename]').getAttribute('data-filename')
    // eslint-disable-next-line no-alert
    : prompt('Filename');
  if (!filename) return;
  const filesize = ev
    ? +ev.currentTarget.closest('[data-size]').getAttribute('data-size')
    : 0;
  let content = '';
  if (ev) {
    const link = $(ev.currentTarget).find('a').attr('href');
    if (!link) return;
    const ext = filename.split('.').pop();
    if (['png', 'jpeg', 'jpg', 'gif', 'webp', 'bmp'].includes(ext)) {
      await previewImage(link);
      return;
    }
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf'].includes(ext)) {
      Notification.info(i18n('Loading file...'));
      let src;
      try {
        const res = await request.get(`${link}${link.includes('?') ? '&noDisposition=1' : '?noDisposition=1'}`);
        src = res.url;
      } catch (e) {
        window.captureException?.(e);
        Notification.error(i18n('Failed to load file: {0}', e.message));
        throw e;
      }
      if (ext === 'pdf') {
        await previewPDF(link, src);
      } else {
        await previewOffice(link, src);
      }
      return;
    }
    if (['zip', 'rar', '7z'].includes(ext) || filesize > 8 * 1024 * 1024) {
      const action = await new ActionDialog({
        $body: tpl.typoMsg(i18n('Cannot preview this file. Download now?')),
      }).open();
      if (action === 'ok') window.open(link);
      return;
    }
    Notification.info(i18n('Loading file...'));
    try {
      const res = await request.get(link);
      content = await request.get(res.url, undefined, { dataType: 'text' });
    } catch (e) {
      window.captureException?.(e);
      Notification.error(i18n('Failed to load file: {0}', e.message));
      throw e;
    }
  } else Notification.info(i18n('Loading editor...'));
  const val = await startEdit(filename, content);
  if (typeof val !== 'string') return;
  Notification.info(i18n('Saving file...'));
  const data = new FormData();
  data.append('filename', filename);
  data.append('file', new Blob([val], { type: 'text/plain' }));
  if (type) data.append('type', type);
  data.append('operation', 'upload_file');
  const postUrl = !window.location.href.endsWith('/files')
    ? `${window.location.href.substring(0, window.location.href.lastIndexOf('/')) }/files` : '';
  await request.postFile(postUrl, data);
  Notification.success(i18n('File saved.'));
  await pjax.request({ push: false });
}

const dataPreviewPage = new AutoloadPage('dataPreview', async () => {
  if ($('[data-preview]').length) {
    $('[data-preview]').on('click', dataPreview);
  }
});

export default dataPreviewPage;
