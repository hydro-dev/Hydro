import $ from 'jquery';
import { ConfirmDialog } from 'vj/components/dialog';
import { NamedPage } from 'vj/misc/Page';
import { i18n, request, tpl } from 'vj/utils';

export default new NamedPage('homework_edit', () => {
  let confirmed = false;
  $(document).on('click', '[value="delete"]', (ev) => {
    ev.preventDefault();
    if (confirmed) {
      return request.post('', { operation: 'delete' }).then((res) => {
        window.location.href = res.url;
      });
    }
    const message = 'Confirm deleting this homework? Its files and status will be deleted as well.';
    return new ConfirmDialog({
      $body: tpl.typoMsg(i18n(message)),
    }).open().then((action) => {
      if (action !== 'yes') return;
      confirmed = true;
      ev.target.click();
    });
  });
});
