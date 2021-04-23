import { AutoloadPage } from 'vj/misc/Page';
import delay from 'vj/utils/delay';

const formPage = new AutoloadPage('formPage', () => {
  $(document).on('vjFormDisableUpdate', 'input, select, textarea', (ev) => {
    const $input = $(ev.currentTarget);
    const $formItem = $input.closest('.form__item');
    if ($input.prop('disabled')) {
      $formItem.addClass('is--disabled');
    } else {
      $formItem.removeClass('is--disabled');
    }
  });

  const submitting = {};
  $(document).on('click', '[type="submit"]', (ev) => {
    const $dom = $(ev.currentTarget);
    if ($dom.attr('name') && $dom.attr('value')) return;
    ev.preventDefault();
    if (!submitting[ev.currentTarget]) $dom.closest('form').trigger('submit');
    submitting[ev.currentTarget] = true;
    delay(5000).then(() => { submitting[ev.currentTarget] = false; });
  });
});

export default formPage;
