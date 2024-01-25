import $ from 'jquery';
import _ from 'lodash';
import { NamedPage } from 'vj/misc/Page';
import pjax from 'vj/utils/pjax';
import { slideDown, slideUp } from 'vj/utils/slide';

type SectionAction = 'expand' | 'collapse';
type SectionState = 'expanded' | 'collapsed';

function action2state(action: SectionAction): SectionState {
  return action === 'expand' ? 'expanded' : 'collapsed';
}

async function setSectionState($section: JQuery<HTMLElement>, state: SectionState) {
  if ($section.is(`.${state}, .animating`)) return;
  $section.addClass('animating');
  const $detail = $section.find('.training__section__detail');
  if (state === 'expanded') {
    await slideDown($detail, 300, { opacity: 0 }, { opacity: 1 });
  } else {
    await slideUp($detail, 300, { opacity: 1 }, { opacity: 0 });
  }
  $section.addClass(state);
  $section.removeClass(state === 'expanded' ? 'collapsed' : 'expanded');
  $section.removeClass('animating');
}

async function handleSection(ev: JQuery.ClickEvent<Document>, type: SectionAction) {
  const $section = $(ev.currentTarget).closest('.training__section');
  await setSectionState($section, action2state(type));
}

function searchUser() {
  const val = $('input[name=uid]').val().toString().toLowerCase();
  const group = $('select[name=group]').val().toString().toLowerCase();
  $('.enroll_user_menu_item').each((i, e) => {
    const $item = $(e);
    const $username = $item.data('uname').toString().toLowerCase();
    const $displayName = $item.data('displayname')?.toString().toLowerCase();
    const $uid = $item.data('uid').toString();
    $item.toggle((($displayName?.includes(val) || $username.includes(val)) && (group === 'all' || group.split(',').includes($uid))) || $uid === val);
  });
}

function selectUser(ev) {
  ev.preventDefault();
  if ($('.enroll_user_menu_item:visible').length === 1) {
    $('.enroll_user_menu_item:visible').first().find('a')[0].click();
  }
}

function handleChooseUser(ev) {
  ev.preventDefault();
  $('.enroll_user_menu_item .active').removeClass('active');
  $(ev.currentTarget).addClass('active');
  pjax.request({ url: ev.currentTarget.href });
}

async function handleSidebarClick(ev: JQuery.ClickEvent<Document>) {
  const id = $(ev.currentTarget).attr('href');
  const $section = $(id).closest('.training__section');
  await setSectionState($section, 'expanded');
}

async function handleHashChange() {
  const id = window.location.hash;
  if (id.startsWith('#node-')) {
    const $section = $(id).closest('.training__section');
    await setSectionState($section, 'expanded');
  }
}

const page = new NamedPage('training_detail', () => {
  $('.search__input').on('input', _.debounce(searchUser, 500));
  $('select[name=group]').on('change', searchUser);
  $('#searchForm').on('submit', selectUser);
  $(document).on('click', '[name="training__section__expand"]', (ev) => handleSection(ev, 'expand'));
  $(document).on('click', '[name="training__section__collapse"]', (ev) => handleSection(ev, 'collapse'));
  $(document).on('click', '.enroll_user_menu_item > a', (ev) => handleChooseUser(ev));
  $(document).on('click', '#menu-item-training_detail > ul > li > a', (ev) => handleSidebarClick(ev));
  window.addEventListener('hashchange', handleHashChange);
  $(handleHashChange);
});

export default page;
