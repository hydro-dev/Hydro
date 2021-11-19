import { NamedPage } from 'vj/misc/Page';
import tpl from 'vj/utils/tpl';
import i18n from 'vj/utils/i18n';
import request from 'vj/utils/request';
import { ActionDialog, ConfirmDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';

const page = new NamedPage([
  'problem_create', 'problem_edit', 'problem_solution', 'problem_submit',
  'problem_files', 'problem_detail', 'discussion_node', 'discussion_detail',
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
    new ActionDialog({
      $body: tpl`
        <div class="typo">
          <label>
            ${i18n('Target')}
            <div class="textbox-container">
              <input name="target" type="text" class="textbox" data-autofocus>
            </div>
          </label>
        </div>
      `,
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
