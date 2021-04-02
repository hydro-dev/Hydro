import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('discussion_node', async () => {
  $(document).on('click', '[name="problem-sidebar__show-category"]', (ev) => {
    $(ev.currentTarget).hide();
    $('[name="problem-sidebar__categories"]').show();
  });
});

export default page;
