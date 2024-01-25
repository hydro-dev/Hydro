import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';
import { i18n, mongoId } from 'vj/utils';

const page = new NamedPage('homework_main', async () => {
  // Homework Calendar
  const { default: Calendar } = await import('vj/components/calendar');
  if (UiContext.docs) {
    const events = UiContext.docs.map((doc) => ({
      beginAt: doc.beginAt,
      endAt: doc.endAt,
      title: doc.title,
      maskFrom: doc.penaltySince ? doc.penaltySince : null,
      maskTitle: i18n('Time Extension'),
      colorIndex: mongoId(doc._id).timestamp % 12,
      link: doc.url,
    }));
    const calendar = new Calendar(events);
    calendar.getDom().appendTo('[name="calendar_entry"]');
    const preference = localStorage.getItem('homework-view') || 'list';
    if (preference === 'calendar') {
      $('.homework__list').hide();
      $('[name="homework_display"]').val('calendar');
    } else {
      $('[name="calendar_entry"]').hide();
      $('[name="homework_display"]').val('list');
    }
    $('[name="homework_display"]').change((ev) => {
      switch (ev.currentTarget.value) {
        case 'calendar':
          $('.homework__list').hide();
          $('[name="calendar_entry"]').show();
          localStorage.setItem('homework-view', 'calendar');
          break;
        case 'list':
          $('.homework__list').show();
          $('[name="calendar_entry"]').hide();
          localStorage.setItem('homework-view', 'list');
          break;
        default:
          throw new Error('Unexpected display parameter');
      }
    });
  }
});

export default page;
