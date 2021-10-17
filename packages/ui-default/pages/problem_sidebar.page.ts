import { NamedPage } from 'vj/misc/Page';
import tpl from 'vj/utils/tpl';
import i18n from 'vj/utils/i18n';
import { ConfirmDialog } from 'vj/components/dialog';

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
});

export default page;
