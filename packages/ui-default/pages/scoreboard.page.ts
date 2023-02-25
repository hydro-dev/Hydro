import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';

function compactScoreboard(tdoc) {
  if (!$('.scoreboard--compact,.scoreboard--acm').length && $('.data-table').width() > window.innerWidth) {
    $(`.scoreboard--${tdoc.rule}`).addClass('scoreboard--compact');
  }
  if (!$('th.col--user').width()) {
    $('.col--user').addClass('compact');
  }
}

const page = new NamedPage(['contest_scoreboard', 'homework_scoreboard'], () => {
  const { tdoc } = UiContext;
  const key = `scoreboard-star/${tdoc.domainId}/${tdoc.docId}`;
  const read = () => JSON.parse(localStorage.getItem(key) || '[]');
  const write = (data) => localStorage.setItem(key, JSON.stringify(data));

  read().forEach((uid) => $(`.star.user--${uid}`).addClass('activated'));
  $('.star').on('click', (e) => {
    const star = read();
    const $target = $(e.currentTarget);
    const uid = $target.data('uid');
    if (star.includes(uid)) {
      $target.removeClass('activated');
      star.splice(star.indexOf(uid), 1);
    } else {
      $target.addClass('activated');
      star.push(uid);
    }
    write(star);
  });

  $('.select.filter').on('change', (e) => {
    const val = $(e.target).val();
    if (val === 'all') {
      $('.data-table tbody tr').show();
    } else if (val === 'star') {
      $('.data-table tbody tr').hide();
      read().forEach((uid) => $(`.star.user--${uid}`).closest('tr').show());
    } else {
      $('.data-table tbody tr').show();
      $('.rank--unrank').closest('tr').hide();
    }
  });

  compactScoreboard(tdoc);
  $(window).on('resize', () => compactScoreboard(tdoc));
});

export default page;
