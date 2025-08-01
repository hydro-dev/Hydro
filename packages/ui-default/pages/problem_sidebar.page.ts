import $ from 'jquery';
import { confirm, prompt } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { i18n, request } from 'vj/utils';

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
    confirm(i18n('Confirm rejudge this problem?')).then((yes) => {
      if (yes) $(ev.currentTarget).closest('form').trigger('submit');
    });
  });
  $(document).on('click', '[name="problem-sidebar__copy"]', async () => {
    const res = await prompt(i18n('Copy Problem'), {
      target: {
        type: 'domain',
        label: i18n('Target'),
        required: true,
        autofocus: true,
      },
    });
    if (!res?.target) return;
    try {
      const { url } = await request.post('.', {
        operation: 'copy',
        pids: [UiContext.pdoc.docId],
        target: res.target,
        redirect: true,
      });
      window.location.href = url;
    } catch (error) {
      Notification.error(error.message);
    }
  });
});

export default page;
