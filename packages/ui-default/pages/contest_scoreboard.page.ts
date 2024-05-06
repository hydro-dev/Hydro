import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';
import { pjax } from 'vj/utils';

const page = new NamedPage(['contest_scoreboard', 'homework_scoreboard'], () => {
  const { tdoc } = UiContext;
  const key = `scoreboard-star/${tdoc.domainId}/${tdoc.docId}`;
  const read = () => JSON.parse(localStorage.getItem(key) || '[]');
  const write = (data) => localStorage.setItem(key, JSON.stringify(data));

  $(`.star.user--${UserContext._id}`).closest('tr').addClass('star-highlight');
  read().forEach((uid) => $(`.star.user--${uid}`).addClass('activated').closest('tr').addClass('star-highlight'));
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
      read().forEach((uid) => $(`.star.user--${uid}`).closest('tr').addClass('star-highlight'));
    } else if (val === 'star') {
      $('.data-table tbody tr').hide();
      read().forEach((uid) => $(`.star.user--${uid}`).closest('tr').show().removeClass('star-highlight'));
    } else if (val === 'rank') {
      $('.data-table tbody tr').show();
      $('.rank--unrank').closest('tr').hide();
    } else {
      $('.data-table tbody tr').hide();
      const uids = val.toString().split(',').map((i) => +i.trim()).filter((i) => i);
      if (!uids?.length) return;
      uids.forEach((uid) => $(`.user--${uid}`).closest('tr').show());
    }
  });

  const beginAt = new Date(UiContext.tdoc.beginAt).getTime();
  const endAt = new Date(UiContext.tdoc.endAt).getTime();
  function updateScoreboard() {
    const now = Date.now();
    if (beginAt <= now && now <= endAt) pjax.request({ url: UiContext.scoreboardUrl || '', push: false });
  }

  setInterval(updateScoreboard, 180000);
});

export default page;
