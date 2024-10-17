import $ from 'jquery';
import DomainSelectAutoComplete from 'vj/components/autocomplete/DomainSelectAutoComplete';
import { ActionDialog, ConfirmDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { i18n, request, tpl } from 'vj/utils';

const page = new NamedPage([
  'problem_create', 'problem_edit', 'problem_solution', 'problem_submit',
  'problem_config', 'problem_statistics', 'problem_files', 'problem_detail',
  'discussion_node', 'discussion_detail',
], () => {
  $(document).on('click', '[name="problem-sidebar__show-category"]', (ev) => {
    $(ev.currentTarget).hide();
    $('[name="problem-sidebar__categories"]').show();
  });
  $(document).on('click', '[name="problem-sidebar__rejudge"]', (ev) => {
    ev.preventDefault();
    new ConfirmDialog({
      $body: tpl.typoMsg(i18n('Confirm rejudge this problem?')),
    }).open().then((action) => {
      if (action !== 'yes') return;
      $(ev.currentTarget).closest('form').trigger('submit');
    });
  });
  $(document).on('click', '[name="problem-sidebar__copy"]', () => {
    $(tpl`<div style="display: none" class="dialog__body--problem-copy">
  <div class="row"><div class="columns">
    <h1 name="select_user_hint">${i18n('Copy Problem')}</h1>
  </div></div>
  <div class="row">
    <div class="columns">
      <label>
      ${i18n('Target')}
        <div class="textbox-container">
          <input name="target" type="text" class="textbox" data-autofocus>
        </div>
      </label>
    </div>
  </div>
</div>`).appendTo(document.body);
    const domainSelector = DomainSelectAutoComplete.getOrConstruct($('.dialog__body--problem-copy [name="target"]')) as any;
    new ActionDialog({
      $body: $('.dialog__body--problem-copy > div'),
      onDispatch(action) {
        if (action === 'ok' && domainSelector.value() === null) {
          domainSelector.focus();
          return false;
        }
        return true;
      },
    }).open().then(async (action) => {
      if (action !== 'ok') return;
      const target = $('[name="target"]').val();
      if (!target) return;
      try {
        const res = await request.post('', {
          operation: 'copy',
          target,
        });
        window.location.href = res.url;
      } catch (error) {
        Notification.error(error.message);
      }
    });
  });
});

export default page;
