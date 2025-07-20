import $ from 'jquery';
import moment from 'moment';
import ReactDOM from 'react-dom/client';
import LanguageSelectAutoComplete from 'vj/components/autocomplete/LanguageSelectAutoComplete';
import ProblemSelectAutoComplete from 'vj/components/autocomplete/ProblemSelectAutoComplete';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import ContestProblemEditor from 'vj/components/contestProblemEditor/ContestProblemEditor';
import { confirm } from 'vj/components/dialog';
import { NamedPage } from 'vj/misc/Page';
import { i18n, request } from 'vj/utils';

export default new NamedPage(['contest_edit', 'contest_create', 'homework_create', 'homework_edit'], (pagename) => {
  ProblemSelectAutoComplete.getOrConstruct($('[name="pids"]'), { multi: true, clearDefaultValue: false });
  UserSelectAutoComplete.getOrConstruct<true>($('[name="maintainer"]'), { multi: true, clearDefaultValue: false });
  LanguageSelectAutoComplete.getOrConstruct($('[name=langs]'), { multi: true });
  if ($('#problem-editor').length) {
    const problemsInput = $('[name=problems]');
    ReactDOM.createRoot($('#problem-editor')[0]).render(
      <ContestProblemEditor
        problems={JSON.parse(problemsInput.val() as string)}
        onChange={(problems) => {
          problemsInput.val(JSON.stringify(problems));
        }}
      />,
    );
  }
  $('[name="rule"]').on('change', () => {
    const rule = $('[name="rule"]').val();
    $('.contest-rule-settings input').attr('disabled', 'disabled');
    $('.contest-rule-settings').hide();
    $(`.contest-rule--${rule} input`).removeAttr('disabled');
    $(`.contest-rule--${rule}`).show();
  }).trigger('change');
  $('[name="beginAtDate"], [name="beginAtTime"], [name="duration"]').on('change', () => {
    const beginAtDate = $('[name="beginAtDate"]').val();
    const beginAtTime = $('[name="beginAtTime"]').val();
    const duration = $('[name="duration"]').val();
    const endAt = moment(`${beginAtDate} ${beginAtTime}`).add(+duration, 'hours').toDate();
    if (endAt) $('[name="endAt"]').val(moment(endAt).format('YYYY-MM-DD HH:mm'));
  });
  $('[name="permission"]').removeAttr('disabled').on('change', () => {
    const type = $('[name="permission"]').val();
    $('[data-perm] input').attr('disabled', 'disabled');
    $('[data-perm]').hide();
    $(`[data-perm="${type}"] input`).removeAttr('disabled');
    $(`[data-perm="${type}"]`).show();
  }).trigger('change');
  if (pagename.endsWith('edit')) {
    let confirmed = false;
    // eslint-disable-next-line consistent-return
    $(document).on('click', '[value="delete"]', (ev) => {
      ev.preventDefault();
      if (confirmed) {
        return request.post('', { operation: 'delete' }).then((res) => {
          window.location.href = res.url;
        });
      }
      const message = `Confirm deleting this ${pagename.split('_')[0]}? Its files and status will be deleted as well.`;
      confirm(i18n(message)).then((yes) => {
        if (yes) {
          confirmed = true;
          ev.target.click();
        }
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
