import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n, request, tpl } from 'vj/utils';

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
      if ($(el).find('.star-form').length) continue;
      const action = $(el).closest('[data-star-action]').data('star-action');
      const star = ['true', true].includes($(el).data('star')) ? 1 : 0;
      $(tpl`<form class="star-form form--inline" action="${action}" method="post">
        <input type="hidden" name="operation" value="star">
        <input type="hidden" name="star" value="${star ? 'false' : 'true'}">
        <button class="star${star ? ' activated' : ''}" type="submit">
          <span class="starred--hide"><span class="icon icon-star--outline" data-tooltip="${i18n('Star')}"></span></span>
          <span class="starred--show"><span class="icon icon-star" data-tooltip="${i18n('Unstar')}"></span></span>
        </button>
      </form>`).prependTo($(el));
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
    const $star = $form.find('[name="star"]');
    if ($op.val() !== 'star') return;
    ev.preventDefault();
    $star.val(currentState ? 'false' : 'true');
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
