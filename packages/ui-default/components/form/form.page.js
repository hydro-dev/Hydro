import { AutoloadPage } from 'vj/misc/Page';
import delay from 'vj/utils/delay'

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

  $('[type="submit"]').on('click', async (ev) => {
    if (!submitting[ev.currentTarget]) $(ev.currentTarget).closest('form').submit();
    submitting[ev.currentTarget] = true;
    await delay(5000);
    submitting[ev.currentTarget] = false;
  })
});

export default formPage;
