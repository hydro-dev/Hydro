import { AutoloadPage } from 'vj/misc/Page';

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
});

export default formPage;
