import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';
import { request, tpl } from 'vj/utils';

function setStarButtonState($starButton: JQuery<any>, star: boolean) {
  if (star) {
    $starButton.addClass('activated');
  } else {
    $starButton.removeClass('activated');
  }
}

const starPage = new AutoloadPage('starPage', () => {
  function render(container) {
    const eles = $(container).find('[data-star]');
    for (const el of eles) {
      if ($(el).find('.star-form')) continue;
      const pid = $(el).closest('[data-pid]').data('pid');
      const star = $(el).data('star') === 'true' ? 1 : 0;
      if (!pid) continue;
      $(tpl`<form class="form--inline" action="/d/${UiContext.domain._id}/p/${pid}" method="post">
        <input type="hidden" name="operation" value="star">
        <input type="hidden" name="star" value="${star ? 'false' : 'true'}">
        <button class="star${star ? ' activated' : ''}" type="submit">
          <span class="starred--hide"><span class="icon icon-star--outline" data-tooltip="{{ _('Star') }}"></span></span>
          <span class="starred--show"><span class="icon icon-star" data-tooltip="{{ _('Unstar') }}"></span></span>
        </button>
      </form>`);
    }
  }

  render(document);
  $(document).on('vjContentNew', (ev) => {
    render(ev.target);
  });

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
