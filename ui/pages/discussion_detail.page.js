import { NamedPage } from 'vj/misc/PageLoader';

const page = new NamedPage('discussion_detail', async () => {
  $(document).on('click', '[name="problem-sidebar__show-category"]', (ev) => {
    $(ev.currentTarget).hide();
    $('[name="problem-sidebar__categories"]').show();
  });
});

export default page;
