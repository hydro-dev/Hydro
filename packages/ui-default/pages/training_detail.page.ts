import $ from 'jquery';
import _ from 'lodash';
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

function searchUser() {
  const val = $('input[name=uid]').val().toString().toLowerCase();
  $('.enroll_user_menu').each((i, e) => {
    const $item = $(e);
    const $username = $item.data('uname').toString().toLowerCase();
    const $uid = $item.data('uid').toString().toLowerCase();
    $item.toggle($username.includes(val) || $uid === val);
  });
}

function selectUser(ev) {
  ev.preventDefault();
  if ($('.enroll_user_menu:visible').length === 1) {
    $('.enroll_user_menu:visible').first().find('a')[0].click();
  }
}

const page = new NamedPage('training_detail', () => {
  $('.search__input').on('input', _.debounce(searchUser, 500));
  $('#searchForm').on('submit', selectUser);
  $(document).on('click', '[name="training__section__expand"]', (ev) => handleSection(ev, 'expand'));
  $(document).on('click', '[name="training__section__collapse"]', (ev) => handleSection(ev, 'collapse'));
});

export default page;
