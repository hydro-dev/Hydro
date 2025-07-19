import $ from 'jquery';
import { confirm } from 'vj/components/dialog';
import { NamedPage } from 'vj/misc/Page';
import { i18n, request } from 'vj/utils';

export default new NamedPage('training_edit', () => {
  let confirmed = false;
  $(document).on('click', '[name="operation"]', (ev) => {
    ev.preventDefault();
    if (confirmed) {
      return request.post('.', { operation: 'delete' }).then((res) => {
        window.location.href = res.url;
      });
    }
    const message = 'Confirm deleting this training? Its files and status will be deleted as well.';
    return confirm(i18n(message)).then((yes) => {
      if (!yes) return;
      confirmed = true;
      ev.target.click();
    });
  });
});
