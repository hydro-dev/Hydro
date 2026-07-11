import $ from 'jquery';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { i18n, request, tpl } from 'vj/utils';

const page = new NamedPage('contest_manage', () => {
  $(document).on('click', '[name="set_score"]', async (ev) => {
    const pid = $(ev.currentTarget).data('pid');
    const op = await new ActionDialog({
      $body: tpl`
      <div class="row"><div class="columns">
        <h1>${i18n('Set Score for Contest')}</h1>
      </div></div>
      <div class="row"><div class="columns">
        <label>
          ${i18n('score')}
          <div class="textbox-container">
            <input class="textbox" type="number" step="1" name="score" data-autofocus value="${$(ev.currentTarget).data('score')}"></input>
          </div>
        </label>
      </div></div>
      `,
      onDispatch(action) {
        if (action === 'ok' && $('[name="score"]').val() === null) {
          $('[name="score"]').focus();
          return false;
        }
        if (!Number.isFinite(+$('[name="score"]').val()) || +$('[name="score"]').val() <= 0) {
          Notification.error('Invalid score');
          return false;
        }
        return true;
      },
    }).open();
    if (op !== 'ok') return;
    try {
      const res = await request.post('', {
        operation: 'set_score',
        pid,
        score: $('[name="score"]').val(),
      });
      if (!res.error) {
        Notification.success('Score Updated');
        $(ev.currentTarget).text($('[name="score"]').val() as number);
        $(ev.currentTarget).data('score', $('[name="score"]').val());
      }
    } catch (e) {
      Notification.error(e.message);
    }
  });
});

export default page;
