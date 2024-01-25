import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';
import { request } from 'vj/utils';

function setStarButtonState($starButton: JQuery<any>, star: boolean) {
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
    if (!['star', 'unstar'].includes($op.val() as any)) return;
    ev.preventDefault();
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
