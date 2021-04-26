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
    if (submitting[ev.currentTarget]) ev.preventDefault();
    submitting[ev.currentTarget] = true;
    delay(5000).then(() => { submitting[ev.currentTarget] = false; });
  });
});

export default formPage;
