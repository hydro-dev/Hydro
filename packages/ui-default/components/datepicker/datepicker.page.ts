import { AutoloadPage } from 'vj/misc/Page';

const datepickerPage = new AutoloadPage('datepickerPage', async () => {
  async function datepicker($containers) {
    await import('pickadate/lib/picker.date');
    $containers.get().forEach((container) => {
      $(container).pickadate({
        format: 'yyyy-mm-dd',
        editable: true,
        clear: false,
      });
    });
  }
  datepicker($('[data-pick-date]'));
  async function timepicker($containers) {
    await import('pickadate/lib/picker.time');
    $containers.get().forEach((container) => {
      $(container).pickatime({
        format: 'H:i',
        editable: true,
        interval: 15,
        clear: false,
      });
    });
  }
  timepicker($('[data-pick-time]'));
  $(document).on('vjContentNew', (e) => datepicker($(e.target).find('[data-pick-date]')));
  $(document).on('vjContentNew', (e) => timepicker($(e.target).find('[data-pick-time]')));
});

export default datepickerPage;
