import { NamedPage } from 'vj/misc/PageLoader';
import { slideDown, slideUp } from 'vj/utils/slide';

async function handleSectionExpand(ev) {
  const $section = $(ev.currentTarget).closest('.training__section');
  if ($section.is('.expanded, .animating')) {
    return;
  }
  $section.addClass('animating');
  const $detail = $section.find('.training__section__detail');
  await slideDown($detail, 300, { opacity: 0 }, { opacity: 1 });
  $section.addClass('expanded');
  $section.removeClass('collapsed');
  $section.removeClass('animating');
}

async function handleSectionCollapse(ev) {
  const $section = $(ev.currentTarget).closest('.training__section');
  if ($section.is('.collapsed, .animating')) {
    return;
  }
  $section.addClass('animating');
  const $detail = $section.find('.training__section__detail');
  await slideUp($detail, 300, { opacity: 1 }, { opacity: 0 });
  $section.addClass('collapsed');
  $section.removeClass('expanded');
  $section.removeClass('animating');
}

const page = new NamedPage('training_detail', async () => {
  $(document).on('click', '[name="training__section__expand"]', handleSectionExpand);
  $(document).on('click', '[name="training__section__collapse"]', handleSectionCollapse);
});

export default page;
