import Clusterize from 'clusterize.js';
import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';
import { pjax } from 'vj/utils';

const page = new NamedPage(['contest_scoreboard', 'homework_scoreboard'], () => {
  const { tdoc } = UiContext;
  const key = `scoreboard-star/${tdoc.domainId}/${tdoc.docId}`;
  const read = () => JSON.parse(localStorage.getItem(key) || '[]').map((i) => +i);
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

  const rows: Record<number, string> = {};
  const total = [];
  let nowRendering = [];
  const unrank = [];
  for (const line of $('.data-table tbody tr')) {
    const uid = +$(line).find('[data-uid]').data('uid');
    line.style.display = 'table-row';
    rows[uid] = line.outerHTML;
    nowRendering.push(uid);
    total.push(uid);
    if ($(line).find('.rank--unrank').length) unrank.push(uid);
    $(line).remove();
  }

  const virtualizedList = new Clusterize({
    rows: nowRendering.map((i) => rows[i]),
    scrollElem: $('.data-table').get(0),
    contentElem: $('tbody').get(0),
  });

  $('.select.filter').on('change', (e) => {
    const val = $(e.target).val();
    if (val === 'all') nowRendering = total;
    else if (val === 'star') nowRendering = read();
    else if (val === 'rank') nowRendering = total.filter((i) => !unrank.includes(i));
    else {
      nowRendering = [];
      const uids = val.toString().split(',').map((i) => +i.trim()).filter((i) => i);
      for (const uid of total) {
        if (!uids.includes(+uid)) continue;
        nowRendering.push(uid);
      }
    }
    virtualizedList.update(nowRendering.map((i) => rows[i]));
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
