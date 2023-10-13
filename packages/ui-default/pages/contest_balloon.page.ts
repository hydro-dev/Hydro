import $ from 'jquery';
import yaml from 'js-yaml';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, i18n, pjax, request, tpl,
} from 'vj/utils';

async function handleSetColor(tdoc) {
  const { default: Editor } = await import('vj/components/editor/index');
  let val = tdoc.balloon;
  if (!val) {
    val = {};
    tdoc.pids.forEach((pid) => { val[+pid] = { color: '#ffffff', name: '' }; });
  }
  Notification.info(i18n('Loading...'));
  const promise = new ActionDialog({
    $body: tpl`
    <div class="row"><div class="columns">
        <label>
        ${i18n('Set color')}
        <textarea name="balloonColor" class="textbox">${yaml.dump(val)}</textarea>
        </label>
    </div></div>`,
  }).open();
  const editor = new Editor($('[name="balloonColor"]'), {
    value: yaml.dump(val),
    autoResize: false,
    autoLayout: false,
    language: 'yaml',
    model: 'hydro://balloon.yaml',
  });
  const action = await promise;
  const color = (editor.value() as string).replace(/\r\n/g, '\n');
  editor.destory();
  if (action !== 'ok') return;
  Notification.info(i18n('Updating...'));
  try {
    await request.post('', { operation: 'set_color', color });
  } catch (e) {
    Notification.error(`${e.message} ${e.params?.[0]}`);
  }
  Notification.info(i18n('Successfully updated.'));
  await delay(1000);
  window.location.reload();
}

const page = new NamedPage('contest_balloon', () => {
  const { tdoc } = UiContext;

  const beginAt = new Date(tdoc.beginAt).getTime();
  const endAt = new Date(tdoc.endAt).getTime();
  function update() {
    const now = Date.now();
    if (beginAt <= now && now <= endAt) pjax.request({ url: '', push: false });
  }

  $('[name="set_color"]').on('click', () => handleSetColor(tdoc));
  setInterval(update, 60000);
});

export default page;
