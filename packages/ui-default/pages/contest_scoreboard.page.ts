import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';
import { pjax } from 'vj/utils';
import { openDB } from 'vj/utils/db';

const page = new NamedPage(['contest_scoreboard', 'homework_scoreboard'], async () => {
  const db = await openDB;
  const { tdoc } = UiContext;
  const id = `${tdoc.domainId}/${tdoc.docId}`;
  const read = async () => (await db.get('scoreboard-star', id))?.data || [];
  const write = (data) => db.put('scoreboard-star', { id, data });

  $(`.star.user--${UserContext._id}`).closest('tr').addClass('star-highlight');
  (await read()).forEach((uid) => $(`.star.user--${uid}`).addClass('activated').closest('tr').addClass('star-highlight'));
  $('.star').on('click', async (e) => {
    const star = await read();
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

  async function update() {
    const val = $($('.select.filter')).val();
    if (val === 'all') {
      $('.data-table tbody tr').show();
      (await read()).forEach((uid) => $(`.star.user--${uid}`).closest('tr').addClass('star-highlight'));
    } else if (val === 'star') {
      $('.data-table tbody tr').hide();
      (await read()).forEach((uid) => $(`.star.user--${uid}`).closest('tr').show().removeClass('star-highlight'));
    } else if (val === 'rank') {
      $('.data-table tbody tr').show();
      $('.rank--unrank').closest('tr').hide();
    } else {
      $('.data-table tbody tr').hide();
      const uids = val.toString().split(',').map((i) => +i.trim()).filter((i) => i);
      if (!uids?.length) return;
      uids.forEach((uid) => $(`.user--${uid}`).closest('tr').show());
    }
  }

  function getFilterFromHash() {
    const hash = location.hash.slice(1);
    if (hash.startsWith('filter=')) return hash.slice(7);
    return null;
  }

  const initialFilter = getFilterFromHash() || 'all';
  $('.select.filter').val(initialFilter);
  await update();

  $('.select.filter').on('change', async () => {
    await update();
    const val = $('.select.filter').val();
    history.replaceState(null, '', `#filter=${val}`);
  });

  const beginAt = new Date(UiContext.tdoc.beginAt).getTime();
  const endAt = new Date(UiContext.tdoc.endAt).getTime();
  async function updateScoreboard() {
    const now = Date.now();
    if (beginAt <= now && now <= endAt) {
      await pjax.request({ url: UiContext.scoreboardUrl || '', push: false });
      await update();
    }
  }

  setInterval(updateScoreboard, 180000);
  window.addEventListener('hashchange', async () => {
    const filter = getFilterFromHash();
    if (filter) {
      $('.select.filter').val(filter);
      await update();
    }
  });
});

export default page;
