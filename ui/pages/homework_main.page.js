import { NamedPage } from 'vj/misc/PageLoader';
import Calendar from 'vj/components/calendar';
import i18n from 'vj/utils/i18n';
import { parse as parseMongoId } from 'vj/utils/mongoId';

const page = new NamedPage('homework_main', () => {
  // Homework Calendar
  if (Context.docs) {
    const events = Context.docs.map(doc => ({
      beginAt: doc.begin_at * 1000,
      endAt: doc.end_at * 1000,
      title: doc.title,
      maskFrom: doc.penalty_since ? doc.penalty_since * 1000 : null,
      maskTitle: i18n('Time Extension'),
      colorIndex: parseMongoId(doc.id).timestamp % 12,
      link: doc.url,
    }));
    const calendar = new Calendar(events);
    calendar.getDom().appendTo('[name="calendar_entry"]');
    $('[name="homework_display"]').change((ev) => {
      switch (ev.currentTarget.value) {
      case 'calendar':
        $('.homework__list').hide();
        $('[name="calendar_entry"]').show();
        break;
      case 'list':
        $('.homework__list').show();
        $('[name="calendar_entry"]').hide();
        break;
      default:
        throw new Error('Unexpected display parameter');
      }
    });
  }
});

export default page;
