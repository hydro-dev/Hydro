import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('contest_scoreboard', () => {
  const { tdoc } = UiContext;
  let starData = JSON.parse(localStorage.getItem('Hydro.starData')) || {};
  Object.keys(starData).forEach((key) => {
    if (starData[key].expire < Date.now()) delete starData[key];
  });
  if (!starData[tdoc.docId]) {
    starData[tdoc.docId] = {
      expire: tdoc.endAt + 1000 * 60 * 60 * 24 * 7,
      starUids: [],
    };
  } else {
    starData[tdoc.docId].starUids.forEach((uid) => {
      console.log(uid);
      $(`.star.user--${uid}`).addClass('activated');
    });
  }
  console.log(starData[tdoc.docId].starUids);
  localStorage.setItem('Hydro.starData', JSON.stringify(starData));
  $('.star').on('click', (e) => {
    starData = JSON.parse(localStorage.getItem('Hydro.starData'));
    const $target = $(e.currentTarget);
    const uid = $target.data('uid');
    if (starData[tdoc.docId].starUids.includes(uid)) {
      $target.removeClass('activated');
      starData[tdoc.docId].starUids.splice(starData[tdoc.docId].starUids.indexOf(uid), 1);
    } else {
      $target.addClass('activated');
      starData[tdoc.docId].starUids.push(uid);
    }
    localStorage.setItem('Hydro.starData', JSON.stringify(starData));
  });

  $('.select.filter').on('change', (e) => {
    const val = $(e.target).val();
    if (val === 'all') {
      $('.data-table tbody tr').show();
    } else if (val === 'star') {
      $('.data-table tbody tr').hide();
      starData[tdoc.docId].starUids.forEach((uid) => {
        $(`.star.user--${uid}`).closest('tr').show();
      });
    } else {
      $('.data-table tbody tr').hide();
      $('.rank--unrank').closest('tr').show();
    }
  });
});

export default page;
