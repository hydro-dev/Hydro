import { AutoloadPage } from 'vj/misc/Page';
import request from 'vj/utils/request';

function setStarButtonState($starButton, star) {
  if (star) {
    $starButton.addClass('activated');
  } else {
    $starButton.removeClass('activated');
  }
}

const starPage = new AutoloadPage('starPage', () => {
  $(document).on('click', '.star', (ev) => {
    const $button = $(ev.currentTarget);
    const currentState = $button.hasClass('activated');
    const $form = $button.closest('form');
    const $op = $form.find('[name="operation"]');
    if (!['star', 'unstar'].includes($op.val())) return;
    $op.val(currentState ? 'unstar' : 'star');
    setStarButtonState($button, !currentState);
    request
      .post($form.attr('action'), $form)
      .then((data) => {
        setStarButtonState($button, data.star);
      })
      .catch(() => {
        // TODO: notify failure
        setStarButtonState($button, currentState);
      });
  });
});

export default starPage;
