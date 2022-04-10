import { NamedPage } from 'vj/misc/Page';
import { slideDown, slideUp } from 'vj/utils/slide';
import request from 'vj/utils/request';
import loadReactRedux from 'vj/utils/loadReactRedux';
import i18n from 'vj/utils/i18n';
import yaml from 'js-yaml';
import Notification from 'vj/components/notification';
import Dialog from 'vj/components/dialog/index';
import { size, readCasesFromFiles, readSubtasksFromFiles } from '@hydrooj/utils/lib/common';

async function handleSection(ev: JQuery.ClickEvent<Document, undefined, any, any>, type: string) {
  const $section = $(ev.currentTarget).closest('.section--problem-sidebar-testdata');
  if ($section.is(`.${type}d, .animating`)) return;
  $section.addClass('animating');
  const $detail = $section.find('.problem-sidebar-testdata__detail');
  if (type === 'expand') {
    await slideDown($detail, 300, { opacity: 0 }, { opacity: 1 });
  } else {
    await slideUp($detail, 300, { opacity: 1 }, { opacity: 0 });
  }
  $section.addClass(type === 'expand' ? 'expanded' : 'collapsed');
  $section.removeClass(type === 'expand' ? 'collapsed' : 'expanded');
  $section.removeClass('animating');
}

function onBeforeUnload(e) {
  e.returnValue = '';
}

function ensureFile(testdata) {
  return (file: string) => testdata.filter((i) => i === file)[0];
}

const page = new NamedPage('problem_config', () => {
  let reduxStore;

  async function handleClickUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.click();
    await new Promise((resolve) => { input.onchange = resolve; });
    const { files } = input;
    const dialog = new Dialog({
      $body: `
        <div class="file-label" style="text-align: center; margin-bottom: 5px; color: gray; font-size: small;"></div>
        <div class="bp3-progress-bar bp3-intent-primary bp3-no-stripes">
          <div class="file-progress bp3-progress-meter" style="width: 0"></div>
        </div>
        <div class="upload-label" style="text-align: center; margin: 5px 0; color: gray; font-size: small;"></div>
        <div class="bp3-progress-bar bp3-intent-primary bp3-no-stripes">
          <div class="upload-progress bp3-progress-meter" style="width: 0"></div>
        </div>`,
    });
    try {
      Notification.info(i18n('Uploading files...'));
      window.addEventListener('beforeunload', onBeforeUnload);
      dialog.open();
      const $uploadLabel = dialog.$dom.find('.dialog__body .upload-label');
      const $uploadProgress = dialog.$dom.find('.dialog__body .upload-progress');
      const $fileLabel = dialog.$dom.find('.dialog__body .file-label');
      const $fileProgress = dialog.$dom.find('.dialog__body .file-progress');
      for (const i in files) {
        if (Number.isNaN(+i)) continue;
        const file = files[i];
        const data = new FormData();
        data.append('filename', file.name);
        data.append('file', file);
        data.append('type', 'testdata');
        data.append('operation', 'upload_file');
        await request.postFile('./files', data, {
          xhr() {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('loadstart', () => {
              $fileLabel.text(`[${+i + 1}/${files.length}] ${file.name}`);
              $fileProgress.width(`${Math.round((+i + 1) / files.length * 100)}%`);
              $uploadLabel.text(i18n('Uploading... ({0}%)', 0));
              $uploadProgress.width(0);
            });
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                if (percentComplete === 100) $uploadLabel.text(i18n('Processing...'));
                else $uploadLabel.text(i18n('Uploading... ({0}%)', percentComplete));
                $uploadProgress.width(`${percentComplete}%`);
              }
            }, false);
            return xhr;
          },
        });
        reduxStore.dispatch({
          type: 'CONFIG_ADD_TESTDATA',
          value: {
            _id: file.name,
            name: file.name,
            size: file.size,
          },
        });
        $('.testdata-table tbody').append(
          // FIXME: problemId
          `<tr data-filename="1.in" data-size="6">
            <td class="col--name" title="${file.name}"><a href="/p/?/file/${file.name}?type=testdata">${file.name}</a></td>
            <td class="col--size">${size(file.size)}</td>
            <td class="col--operation"><a href="javascript:;" name="${file.name}"><span class="icon icon-delete"></span></a></td>
          </tr>`,
        );
      }
      window.removeEventListener('beforeunload', onBeforeUnload);
      Notification.success(i18n('File uploaded successfully.'));
    } catch (e) {
      console.error(e);
      Notification.error(i18n('File upload failed: {0}', e.toString()));
    } finally {
      dialog.close();
    }
  }

  async function uploadConfig(config:object) {
    const configYaml = yaml.dump(config);
    Notification.info(i18n('Saving file...'));
    const data = new FormData();
    data.append('filename', 'config.yaml');
    data.append('file', new Blob([configYaml], { type: 'text/plain' }));
    data.append('type', 'testdata');
    data.append('operation', 'upload_file');
    await request.postFile('./files', data);
    Notification.success(i18n('File saved.'));
    window.location.reload();
  }

  async function mountComponent() {
    const { default: ProblemConfigEditor } = await import('vj/components/problemconfig/ProblemConfigEditor');
    const { default: ProblemConfigForm } = await import('vj/components/problemconfig/ProblemConfigForm');
    const { default: ProblemConfigReducer } = await import('vj/components/problemconfig/reducer');

    const {
      React, render, Provider, store,
    } = await loadReactRedux(ProblemConfigReducer);

    reduxStore = store;

    store.dispatch({
      type: 'CONFIG_LOAD',
      payload: request.get(),
    });
    render(
      <Provider store={store}>
        <div className="row">
          <div className="medium-5 columns">
            <ProblemConfigEditor />
          </div>
          <div className="medium-7 columns">
            <ProblemConfigForm
              onAutoLoad={async () => {
                const testdata = (reduxStore.getState().testdata || []).map((i) => i.name);
                const checkFile = ensureFile(testdata);
                let autocases = await readCasesFromFiles(testdata, checkFile, {});
                if (!autocases.count) {
                  autocases = await readSubtasksFromFiles(testdata, checkFile, {}, { subtasks: [] });
                }
                reduxStore.dispatch({
                  type: 'CONFIG_AUTOCASES_UPDATE',
                  value: autocases,
                });
              }}
            />
          </div>
        </div>
        <button className="rounded primary button" onClick={() => uploadConfig(store.getState().config)}>{i18n('Submit')}</button>
      </Provider>,
      $('#ProblemConfig').get(0),
    );
  }

  mountComponent();

  $(document).on('click', '[name="testdata__upload"]', () => handleClickUpload());
  $(document).on('click', '[name="testdata__section__expand"]', (ev) => handleSection(ev, 'expand'));
  $(document).on('click', '[name="testdata__section__collapse"]', (ev) => handleSection(ev, 'collapse'));
});

export default page;
