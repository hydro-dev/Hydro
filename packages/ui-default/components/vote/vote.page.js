import $ from 'jquery';
import Notification from 'vj/components/notification';
import Rotator from 'vj/components/rotator';
import { AutoloadPage } from 'vj/misc/Page';
import { request } from 'vj/utils';

function setVoteState($container, value, status) {
  const $num = $container.find('.vote-number');
  Rotator.get($num).setValue(value);
  $container.find('.vote-button').removeClass('active');
  if (status === 1) {
    $container.find('.upvote').addClass('active');
  } else if (status === -1) {
    $container.find('.downvote').addClass('active');
  }
}

function applyRotator(element) {
  Rotator.getOrConstruct($(element));
}

const votePage = new AutoloadPage('votePage', () => {
  $('.vote-number.rotator--enabled').get().forEach((element) => applyRotator(element));
  $(document).on('click', '.vote-button', (ev) => {
    const $button = $(ev.currentTarget);
    const $container = $button.closest('.vote');
    const $form = $button.closest('form');
    request
      .post($form.attr('action'), {
        operation: $button.attr('value'),
        psid: $form.find('input[name="psid"]').val(),
      })
      .then((data) => {
        setVoteState($container, data.vote, data.user_vote);
      })
      .catch((e) => {
        Notification.error(`Failed to vote: ${e.message}`);
      });
    return false;
  });
});

export default votePage;
