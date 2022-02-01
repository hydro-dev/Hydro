import { NamedPage } from 'vj/misc/Page';
import { ConfirmDialog } from 'vj/components/dialog';
import ProblemSelectAutoComplete from 'vj/components/autocomplete/ProblemSelectAutoComplete';
import tpl from 'vj/utils/tpl';
import i18n from 'vj/utils/i18n';
import request from 'vj/utils/request';

const page = new NamedPage(['contest_edit', 'contest_create', 'homework_create', 'homework_edit'], (pagename) => {
  ProblemSelectAutoComplete.getOrConstruct($('[name="pids"]'), { multi: true, clearDefaultValue: false });
  if (pagename.endsWith('edit')) {
    let confirmed = false;
    $(document).on('click', '[name="operation"]', (ev) => {
      ev.preventDefault();
      if (confirmed) {
        return request.post('.', { operation: 'delete' }).then((res) => {
          window.location.href = res.url;
        });
      }
      const message = `Confirm deleting this ${pagename.split('_')[0]}? Its status will be deleted as well.`;
      return new ConfirmDialog({
        $body: tpl.typoMsg(i18n(message)),
      }).open().then((action) => {
        if (action !== 'yes') return;
        confirmed = true;
        ev.target.click();
      });
    });
  }
});

export default page;
