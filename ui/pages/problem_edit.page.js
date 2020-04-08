import { NamedPage } from 'vj/misc/PageLoader';

const page = new NamedPage('problem_edit', async () => {
  $(document).on('click', '[name="problem-sidebar__show-category"]', (ev) => {
    $(ev.currentTarget).hide();
    $('[name="problem-sidebar__categories"]').show();
  });
});

export default page;
