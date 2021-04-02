import { AutoloadPage } from 'vj/misc/Page';

const datepickerPage = new AutoloadPage('datepickerPage', async () => {
  if ($('[data-pick-date]').length > 0) {
    await import('pickadate/lib/picker.date');
    $('[data-pick-date]').pickadate({
      format: 'yyyy-m-d',
      clear: false,
    });
  }
  if ($('[data-pick-time]').length > 0) {
    await import('pickadate/lib/picker.time');
    $('[data-pick-time]').pickatime({
      format: 'H:i',
      interval: 15,
      clear: false,
    });
  }
});

export default datepickerPage;
