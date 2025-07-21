import { normalizeSubtasks, readSubtasksFromFiles, SubtaskType } from '@hydrooj/common';
import $ from 'jquery';
import yaml from 'js-yaml';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { confirm, prompt } from 'vj/components/dialog/index';
import Notification from 'vj/components/notification';
import { configYamlFormat } from 'vj/components/problemconfig/ProblemConfigEditor';
import uploadFiles from 'vj/components/upload';
import download from 'vj/components/zipDownloader';
import { NamedPage } from 'vj/misc/Page';
import {
  i18n, loadReactRedux, pjax, request,
} from 'vj/utils';

const page = new NamedPage('problem_config', () => {
  let reduxStore;

  async function handleClickUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.click();
    await new Promise((resolve) => { input.onchange = resolve; });
    await uploadFiles('./files', input.files, {
      type: 'testdata',
      sidebar: true,
      pjax: true,
      singleFileUploadCallback: (file) => {
        reduxStore.dispatch({
          type: 'CONFIG_ADD_TESTDATA',
          value: {
            _id: file.name,
            name: file.name,
            size: file.size,
          },
        });
      },
    });
  }

  async function handleClickRename(ev: JQuery.ClickEvent<Document, undefined, any, any>) {
    const file = [$(ev.currentTarget).parent().parent().attr('data-filename')];
    const newName = (await prompt(i18n('Enter a new name for the file: '), {
      name: { required: true, type: 'text', autofocus: true },
    }))?.name as string;
    if (!newName) return;
    try {
      await request.post('./files', {
        operation: 'rename_files',
        files: file,
        newNames: [newName],
        type: 'testdata',
      });
      Notification.success(i18n('File have been renamed.'));
      await pjax.request({ url: './files?d=testdata&sidebar=true', push: false });
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleClickRemove(ev: JQuery.ClickEvent<Document, undefined, any, any>) {
    const file = [$(ev.currentTarget).parent().parent().attr('data-filename')];
    if (!(await confirm(i18n('Confirm to delete the file?')))) return;
    try {
      await request.post('./files', {
        operation: 'delete_files',
        files: file,
        type: 'testdata',
      });
      Notification.success(i18n('File have been deleted.'));
      reduxStore.dispatch({
        type: 'CONFIG_DELETE_TESTDATA',
        value: file,
      });
      await pjax.request({ url: './files?d=testdata&sidebar=true', push: false });
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleClickDownloadAll() {
    const files = reduxStore.getState().testdata.map((i) => i.name);
    const { links, pdoc } = await request.post('./files', { operation: 'get_links', files, type: 'testdata' });
    const targets: { filename: string, url: string }[] = [];
    for (const filename of Object.keys(links)) targets.push({ filename, url: links[filename] });
    await download(`${pdoc.docId} ${pdoc.title}.zip`, targets);
  }

  async function uploadConfig(config: object) {
    const configYaml = yaml.dump(configYamlFormat(config));
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
    const [{ default: ProblemConfig }, { default: ProblemConfigReducer }] = await Promise.all([
      import('vj/components/problemconfig/index'),
      import('vj/components/problemconfig/reducer'),
    ]);

    const { Provider, store } = await loadReactRedux(ProblemConfigReducer);

    reduxStore = store;

    store.dispatch({
      type: 'CONFIG_LOAD',
      payload: request.get(''),
    });
    const unsubscribe = store.subscribe(() => {
      // TODO set yaml schema
      const state = store.getState();
      if (!state.config.__loaded) return;
      if (state.config.cases) {
        const score = state.config.score * state.config.cases.length;
        state.config.subtasks = [{
          type: 'sum' as SubtaskType,
          score: score && score < 100 ? score : 100,
          cases: state.config.cases,
          id: 1,
        }];
        delete state.config.cases;
        delete state.config.score;
      }
      if (state.config.subtasks?.length) return;
      const testdata = (state.testdata || []).map((i) => i.name);
      unsubscribe();
      const subtasks = readSubtasksFromFiles(testdata, state.config);
      store.dispatch({
        type: 'CONFIG_AUTOCASES_UPDATE',
        subtasks: normalizeSubtasks(subtasks, (i) => i, state.config.time, state.config.memory, true),
      });
    });
    createRoot(document.getElementById('ProblemConfig')!).render(
      <Provider store={store}>
        <ProblemConfig onSave={() => uploadConfig(store.getState().config)} />
      </Provider>,
    );
  }

  mountComponent();

  $(document).on('click', '[name="testdata__upload"]', () => handleClickUpload());
  $(document).on('click', '[name="testdata__rename"]', (ev) => handleClickRename(ev));
  $(document).on('click', '[name="testdata__delete"]', (ev) => handleClickRemove(ev));
  $(document).on('click', '[name="testdata__download__all"]', () => handleClickDownloadAll());
});

export default page;
