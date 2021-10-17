import { NamedPage } from 'vj/misc/Page';
import { InfoDialog } from 'vj/components/dialog';
import tpl from 'vj/utils/tpl';
import i18n from 'vj/utils/i18n';

export default new NamedPage(['problem_create', 'problem_edit', 'problem_import_syzoj'], () => {
  $('input[name="pid"]').on('blur', () => {
    if (/^[0-9]+$/.test($('input[name="pid"]').val())) {
      new InfoDialog({
        $body: tpl.typoMsg(i18n('Problem ID cannot be a pure number. Leave blank if you want to use numberic id.')),
      }).open();
    }
  });
});
