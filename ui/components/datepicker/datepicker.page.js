import { AutoloadPage } from 'vj/misc/PageLoader';

import 'pickadate/lib/themes/classic.css';
import 'pickadate/lib/themes/classic.date.css';
import 'pickadate/lib/themes/classic.time.css';
import './datepicker.styl';

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
