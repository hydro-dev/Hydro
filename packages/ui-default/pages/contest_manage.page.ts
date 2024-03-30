import $ from 'jquery';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { request } from 'vj/utils';

function handleReplyOrBroadcast(ev) {
  const title = $(ev.currentTarget).data('title');
  const did = $(ev.currentTarget).data('did');

  $('#reply_or_broadcast .section_title').text(title);
  $('#reply_or_broadcast [name="did"]').val(did ?? '');
  const $item = $(`#clarification_${did} .media`);
  if ($item.length) {
    $('#reply_or_broadcast .form__item_subject').hide();
    $('#reply_or_broadcast .clarification-container').empty().append($item.clone());
  } else {
    $('#reply_or_broadcast .form__item_subject').show();
    $('#reply_or_broadcast .clarification-container').empty();
  }
}

const page = new NamedPage('contest_manage', () => {
  $(document).on('click', '[name="broadcast"]', handleReplyOrBroadcast);
  $(document).on('click', '[name="reply"]', handleReplyOrBroadcast);
  $(document).on('click', '.col--score[data-pid]', async (ev) => {
    const pid = $(ev.currentTarget).data('pid');
    const score = prompt('Set score for problem:'); // eslint-disable-line
    if (!Number.isFinite(+score) || +score <= 0) {
      Notification.error('Invalid score');
      return;
    }
    const res = await request.post('', {
      operation: 'set_score',
      pid,
      score,
    });
    if (res.error) {
      Notification.error(res.error);
    } else {
      Notification.success('Updated');
      $(ev.currentTarget).text(score);
    }
  });
});

export default page;
