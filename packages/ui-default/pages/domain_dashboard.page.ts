import { confirm } from 'vj/components/dialog';
import { NamedPage } from 'vj/misc/Page';
import { i18n } from 'vj/utils';

export default new NamedPage('domain_dashboard', () => {
  let confirmed = false;
  $(document).on('submit', '#delete-domain-form', (ev) => {
    if (confirmed) return;
    ev.preventDefault();
    confirm(i18n('Confirm deleting this domain? This action cannot be undone.')).then((yes) => {
      if (!yes) return;
      confirmed = true;
      $(ev.currentTarget).submit();
    });
  });
});
