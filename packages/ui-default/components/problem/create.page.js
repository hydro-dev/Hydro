import $ from 'jquery';
import { alert } from 'vj/components/dialog';
import { NamedPage } from 'vj/misc/Page';
import { i18n } from 'vj/utils';

export default new NamedPage(['problem_create', 'problem_edit'], () => {
  $('input[name="pid"]').on('blur', () => {
    if (/^[0-9]+$/.test($('input[name="pid"]').val())) {
      alert(i18n('Problem ID cannot be a pure number. Leave blank if you want to use numberic id.'));
    }
  });
});
