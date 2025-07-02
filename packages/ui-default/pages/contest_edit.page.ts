import $ from 'jquery';
import moment from 'moment';
import ProblemSelectAutoComplete from 'vj/components/autocomplete/ProblemSelectAutoComplete';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { ConfirmDialog } from 'vj/components/dialog';
import { NamedPage } from 'vj/misc/Page';
import { i18n, request, tpl } from 'vj/utils';

const page = new NamedPage(['contest_edit', 'contest_create', 'homework_create', 'homework_edit'], (pagename) => {
  ProblemSelectAutoComplete.getOrConstruct($('[name="pids"]'), { multi: true, clearDefaultValue: false });
  UserSelectAutoComplete.getOrConstruct<true>($('[name="maintainer"]'), { multi: true, clearDefaultValue: false });
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
  $('[name=limitLang]').removeAttr('disabled').on('change', () => {
    const checked = $('[name=limitLang]').is(':checked');
    if (checked) {
      $('#limitLangListBox').show();
      $('#limitLang_btnBox').show();
    } else {
      $('#limitLangListBox').hide();
      $('#limitLang_btnBox').hide();
    }
  }).trigger('change');
  $('.limitLangListItem').each(function () {
    $(this).removeAttr('disabled');
  }).on('change', () => {
    const selectedLang = [];
    $('.limitLangListItem:checked').each(function () {
      selectedLang.push($(this).val());
    });
    $('[name=limitLangList]').val(selectedLang.join(','));
  }).trigger('change');
  $('#limitLangBtn_selectAll').on('click', () => {
    $('.limitLangListItem').each(function () {
      $(this).attr('checked', 'true');
    });
  });
  $('#limitLangBtn_selectNone').on('click', () => {
    $('.limitLangListItem').each(function () {
      $(this).removeAttr('checked');
    });
  });
  if (pagename.endsWith('edit')) {
    let confirmed = false;
    $(document).on('click', '[value="delete"]', (ev) => {
      ev.preventDefault();
      if (confirmed) {
        return request.post('', { operation: 'delete' }).then((res) => {
          window.location.href = res.url;
        });
      }
      const message = `Confirm deleting this ${pagename.split('_')[0]}? Its files and status will be deleted as well.`;
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
