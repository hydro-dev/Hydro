import { AutoloadPage } from 'vj/misc/Page';

const datepickerPage = new AutoloadPage('datepickerPage', async () => {
  if ($('[data-pick-date]').length) {
    await import('pickadate/lib/picker.date');
    $('[data-pick-date]').pickadate({
      format: 'yyyy-m-d',
      editable: true,
      clear: false,
    });
  }
  if ($('[data-pick-time]').length) {
    await import('pickadate/lib/picker.time');
    $('[data-pick-time]').pickatime({
      format: 'H:i',
      editable: true,
      interval: 15,
      clear: false,
    });
  }
});

export default datepickerPage;
