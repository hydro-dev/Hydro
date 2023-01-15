import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';

function sudoSwitch(type) {
  $('.sudo-div').each((i, e) => {
    $(e).toggle($(e).data('sudo') === type);
  });
  $('.sudo-switch').each((i, e) => {
    $(e).toggle($(e).data('sudo') !== type);
  });
  $('.sudo-div:visible input:visible').first().trigger('focus');
  $('.confirm-div').toggle(type !== 'authn');
}

export default new NamedPage('user_sudo', () => {
  sudoSwitch($($('.sudo-div')[0]).data('sudo'));
  $('[data-sudo]').on('click', (ev) => sudoSwitch($(ev.currentTarget).data('sudo')));
});
