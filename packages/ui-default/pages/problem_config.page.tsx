import { NamedPage } from 'vj/misc/Page';
import { slideDown, slideUp } from 'vj/utils/slide';
import request from 'vj/utils/request';
import loadReactRedux from 'vj/utils/loadReactRedux';
import i18n from 'vj/utils/i18n';
import yaml from 'js-yaml';
import Notification from 'vj/components/notification';

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

const page = new NamedPage('problem_config', () => {
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
            <ProblemConfigForm />
          </div>
        </div>
        <button className="rounded primary button" onClick={() => uploadConfig(store.getState().config)}>{i18n('Submit')}</button>
      </Provider>,
      $('#ProblemConfig').get(0),
    );
  }

  mountComponent();

  $(document).on('click', '[name="testdata__section__expand"]', (ev) => handleSection(ev, 'expand'));
  $(document).on('click', '[name="testdata__section__collapse"]', (ev) => handleSection(ev, 'collapse'));
});

export default page;
