import $ from 'jquery';
import ProblemSelectAutoComplete from 'vj/components/autocomplete/ProblemSelectAutoComplete';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { getAvailableLangs, request, tpl } from 'vj/utils';

const page = new NamedPage('record_main', async () => {
  const [{ default: WebSocket }, { DiffDOM }] = await Promise.all([
    import('../components/socket'),
    import('diff-dom'),
  ]);

  const sock = new WebSocket(UiContext.ws_prefix + UiContext.socketUrl, false, true);
  const dd = new DiffDOM();

  sock.onopen = () => sock.send(JSON.stringify({ rids: UiContext.rids }));
  sock.onmessage = (_, data) => {
    const msg = JSON.parse(data);
    const $newTr = $(msg.html);
    const $oldTr = $(`.record_main__table tr[data-rid="${$newTr.attr('data-rid')}"]`);
    if ($oldTr.length) {
      $oldTr.trigger('vjContentRemove');
      dd.apply($oldTr[0], dd.diff($oldTr[0], $newTr[0]));
      $oldTr.trigger('vjContentNew');
    } else {
      if (+new URLSearchParams(window.location.search).get('page') > 1
        || new URLSearchParams(window.location.search).get('nopush')) return;
      $('.record_main__table tbody').prepend($newTr);
      $('.record_main__table tbody tr:last').remove();
      $newTr.trigger('vjContentNew');
    }
  };
  UserSelectAutoComplete.getOrConstruct($('[name="uidOrName"]'), {
    clearDefaultValue: false,
  });
  ProblemSelectAutoComplete.getOrConstruct($('[name="pid"]'), {
    clearDefaultValue: false,
  });
  const langs = UiContext.domain.langs?.split(',').map((i) => i.trim()).filter((i) => i);
  const availableLangs = getAvailableLangs(langs?.length ? langs : undefined);
  Object.keys(availableLangs).map(
    (i) => ($('select[name="lang"]').append(tpl`<option value="${i}" key="${i}">${availableLangs[i].display}</option>`)));
  const lang = new URL(window.location.href).searchParams.get('lang');
  if (lang) $('select[name="lang"]').val(lang);

  for (const operation of ['rejudge', 'cancel']) {
    $(document).on('click', `[name="operation"][value="${operation}"]`, (ev) => {
      ev.preventDefault();
      const action = $(ev.target).closest('form').attr('action');
      request.post(action, { operation }).catch((e) => Notification.error(e));
    });
  }
});

export default page;
