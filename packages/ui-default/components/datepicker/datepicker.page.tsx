import 'flatpickr/dist/flatpickr.min.css';

import flatpickr from 'flatpickr';
import $ from 'jquery';
import Picker from 'pickadate/lib/picker';
import { AutoloadPage } from 'vj/misc/Page';
import TimePicker from './timepicker';

const datepickerPage = new AutoloadPage('datepickerPage', async () => {
  $('[data-pick-date]').each(function () {
    flatpickr(this, { allowInput: true });
  });
  $('[data-pick-time]').each(function () {
    const $this = $(this);
    if (!$this.data('pickatime')) {
      // eslint-disable-next-line no-new
      new Picker(this, 'pickatime', TimePicker, {
        format: 'H:i',
        editable: true,
        interval: 15,
        clear: false,
        onSet() { $this.trigger('change'); },
      });
    }
  });
});

export default datepickerPage;
