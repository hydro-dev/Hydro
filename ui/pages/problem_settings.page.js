import { NamedPage } from 'vj/misc/PageLoader';

async function handleCategoryClick(ev) {
  const $target = $(ev.currentTarget);
  const $txt = $('[name="category"]');
  console.log($target);
  console.log($txt);
  $txt.val(`${$txt.val()}, ${$target.data('category')}`);
}

const page = new NamedPage('problem_settings', async () => {
  $(document).on('click', '.category-a', handleCategoryClick);
  $(document).on('click', '[name="problem-sidebar__show-category"]', (ev) => {
    $(ev.currentTarget).hide();
    $('[name="problem-sidebar__categories"]').show();
  });
});

export default page;
