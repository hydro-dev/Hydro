import $ from 'jquery';
import { ActionDialog, prompt } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { AutoloadPage } from 'vj/misc/Page';
import { delay, i18n, request } from 'vj/utils';

const contestPage = new AutoloadPage('contestPage', () => {
  $('[data-contest-team-invite]').on('click', async (ev) => {
    const vuid = $(ev.currentTarget).attr('data-vuid');
    const res = await prompt(i18n('Invite Member'), {
      user: {
        type: 'userId',
        label: i18n('Username / UID'),
        required: true,
        autofocus: true,
      },
    });
    if (!res?.user) return;
    request.post(location.pathname, { operation: 'invite', vuid, uid: res.user })
      .then(() => {
        Notification.success(i18n('Invitation sent'));
        delay(1000).then(() => window.location.reload());
      })
      .catch((e) => {
        Notification.error(e.message || e);
      });
  });

  $('[data-contest-team-rename]').on('click', function () {
    const $card = $(this).closest('[data-contest-team]');
    $card.find('[data-contest-team-rename-form]').removeClass('is-hidden')
      .find('input[name="name"]').trigger('focus');
    $(this).addClass('is-hidden');
  });

  $('[data-contest-team-rename-cancel]').on('click', function () {
    const $card = $(this).closest('[data-contest-team]');
    $card.find('[data-contest-team-rename-form]').addClass('is-hidden');
    $card.find('[data-contest-team-rename]').removeClass('is-hidden');
  });

  const $dialogBody = $('.dialog__body--contest-attend > div');
  if (!$dialogBody.length) return;

  function selectMode(mode: 'personal' | 'team') {
    const $button = $dialogBody.find(`[data-contest-attend-mode="${mode}"]`);
    if ($button.prop('disabled')) return;
    $dialogBody.find('[name="contest_attend_mode"]').val(mode);
    $dialogBody.find('[data-contest-attend-mode]').removeClass('primary').attr('aria-pressed', 'false');
    $button.addClass('primary').attr('aria-pressed', 'true');
    $dialogBody.find('[name="contest_attend_vuid"]').prop('disabled', mode !== 'team');
  }

  const attendDialog = new ActionDialog({
    $body: $dialogBody,
    onDispatch(action) {
      if (action !== 'ok') return true;
      const mode = $dialogBody.find('[name="contest_attend_mode"]').val();
      const vuid = $dialogBody.find('[name="contest_attend_vuid"]').val();
      if (mode === 'team' && !vuid) {
        Notification.error(i18n('Please select a team.'));
        return false;
      }
      const $code = $dialogBody.find('[name="contest_attend_code"]');
      if ($code.length && !$code.val()?.toString().trim()) {
        Notification.error(i18n('Invitation code is required.'));
        return false;
      }
      return true;
    },
  });

  attendDialog.clear = function () {
    selectMode('personal');
    this.$dom.find('[name="contest_attend_code"]').val('');
    return this;
  };

  $dialogBody.on('click', '[data-contest-attend-mode]', (ev) => {
    selectMode($(ev.currentTarget).attr('data-contest-attend-mode') as 'personal' | 'team');
  });

  $('[data-contest-attend-form]').on('submit', async (ev) => {
    ev.preventDefault();
    const $form = $(ev.currentTarget);
    const params: Record<string, any> = { operation: 'attend' };

    if ($form.is('[data-contest-needs-dialog]')) {
      const action = await attendDialog.clear().open();
      if (action !== 'ok') return;
      const mode = $dialogBody.find('[name="contest_attend_mode"]').val();
      if (mode === 'team') params.vuid = $dialogBody.find('[name="contest_attend_vuid"]').val();
      const code = $dialogBody.find('[name="contest_attend_code"]').val();
      if (code) params.code = code.toString().trim();
    }

    request.post($form.attr('action') || '', params).then(() => {
      Notification.success(i18n('Successfully attended'));
      delay(1000).then(() => window.location.reload());
    }).catch((e) => {
      Notification.error(e.message || e);
    });
  });
});

export default contestPage;
