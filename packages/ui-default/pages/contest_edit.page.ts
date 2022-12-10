import $ from 'jquery';
import ProblemSelectAutoComplete from 'vj/components/autocomplete/ProblemSelectAutoComplete';
import { ConfirmDialog } from 'vj/components/dialog';
import { NamedPage } from 'vj/misc/Page';
import { i18n, request, tpl } from 'vj/utils';

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
    setInterval(() => {
      $('img').each(function () {
        if ($(this).attr('src').startsWith('file://')) {
          $(this).attr('src', $(this).attr('src').replace('file://', './file/'));
        }
      });
    }, 500);
  }
});

export default page;
