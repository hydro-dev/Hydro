import { NamedPage } from 'vj/misc/Page';
import { slideDown, slideUp } from 'vj/utils/slide';

async function handleSection(ev, type: string) {
  const $section = $(ev.currentTarget).closest('.training__section');
  if ($section.is(`.${type}d, .animating`)) return;
  $section.addClass('animating');
  const $detail = $section.find('.training__section__detail');
  if (type === 'expand') {
    await slideDown($detail, 300, { opacity: 0 }, { opacity: 1 });
  } else {
    await slideUp($detail, 300, { opacity: 1 }, { opacity: 0 });
  }
  $section.addClass(type === 'expand' ? 'expanded' : 'collapsed');
  $section.removeClass(type === 'expand' ? 'collapsed' : 'expanded');
  $section.removeClass('animating');
}

const page = new NamedPage('training_detail', () => {
  $(document).on('click', '[name="training__section__expand"]', (ev) => handleSection(ev, 'expand'));
  $(document).on('click', '[name="training__section__collapse"]', (ev) => handleSection(ev, 'collapse'));
});

export default page;
