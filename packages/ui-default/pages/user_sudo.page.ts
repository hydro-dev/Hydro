import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';

function sudoSwitch(type, init = false) {
  $('.sudo-div').each((i, e) => {
    $(e).toggle($(e).data('sudo') === type);
  });
  $('.sudo-switch').each((i, e) => {
    $(e).toggle($(e).data('sudo') !== type);
  });
  if (type === 'authn') {
    $('.confirm-div input[name=confirm]').prop({ type: '', disabled: true }).hide();
    $('.confirm-div input[name=webauthn_verify]').prop({ type: 'submit', disabled: false }).show();
    if (!init) $('.confirm-div input[name=webauthn_verify]').trigger('click');
  } else {
    $('.confirm-div input[name=webauthn_verify]').prop({ type: '', disabled: true }).hide();
    $('.confirm-div input[name=confirm]').prop({ type: 'submit', disabled: false }).show();
  }
  $('.sudo-div:visible input:visible').first().trigger('focus');
}

export default new NamedPage('user_sudo', () => {
  sudoSwitch($($('.sudo-div')[0]).data('sudo'), true);
  $('.sudo-switch').on('click', (ev) => sudoSwitch($(ev.currentTarget).data('sudo')));
});
