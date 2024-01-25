import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';

const textboxPage = new AutoloadPage('textboxPage', () => {
  $(document).on('focusin', '.textbox.material input', (ev) => {
    $(ev.currentTarget).parent().addClass('focus');
  });

  $(document).on('focusout', '.textbox.material input', (ev) => {
    $(ev.currentTarget).parent().removeClass('focus');
  });

  const $focusElement = $(document.activeElement);
  if ($focusElement.prop('tagName') === 'INPUT'
    && $focusElement.parent().is('.textbox.material')
  ) {
    $focusElement.focusin();
  }
});

export default textboxPage;
