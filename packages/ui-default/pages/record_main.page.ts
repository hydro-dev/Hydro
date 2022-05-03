import { NamedPage } from 'vj/misc/Page';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import ProblemSelectAutoComplete from 'vj/components/autocomplete/ProblemSelectAutoComplete';
import tpl from 'vj/utils/tpl';
import getAvailableLangs from 'vj/utils/availableLangs';

const page = new NamedPage('record_main', async () => {
  const [{ default: WebSocket }, { DiffDOM }] = await Promise.all([
    import('../components/socket'),
    import('diff-dom'),
  ]);

  const sock = new WebSocket(UiContext.socketUrl);
  const dd = new DiffDOM();

  let firstLoad = true;
  sock.onopen = () => {
    if (firstLoad) sock.send(JSON.stringify({ rids: UiContext.rids }));
    firstLoad = false;
  };
  sock.onmessage = (message) => {
    const msg = JSON.parse(message.data);
    const $newTr = $(msg.html);
    const $oldTr = $(`.record_main__table tr[data-rid="${$newTr.attr('data-rid')}"]`);
    if ($oldTr.length) {
      $oldTr.trigger('vjContentRemove');
      dd.apply($oldTr[0], dd.diff($oldTr[0], $newTr[0]));
      $oldTr.trigger('vjContentNew');
    } else {
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
  const availableLangs = getAvailableLangs(UiContext.domain.langs?.split(','));
  Object.keys(availableLangs).map(
    (i) => ($('select[name="lang"]').append(tpl`<option value="${i}" key="${i}">${availableLangs[i].display}</option>`)));
  const lang = new URL(window.location.href).searchParams.get('lang');
  if (lang) $('select[name="lang"]').val(lang);
});

export default page;
