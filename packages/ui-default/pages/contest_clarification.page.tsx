import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';

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

const page = new NamedPage('contest_clarification', () => {
  $(document).on('click', '[name="broadcast"]', handleReplyOrBroadcast);
  $(document).on('click', '[name="reply"]', handleReplyOrBroadcast);
});

export default page;
