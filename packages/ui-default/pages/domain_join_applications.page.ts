import $ from 'jquery';
import * as domainEnum from 'vj/constant/domain';
import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('domain_join_applications', () => {
  const $role = $('[name="role"]');
  const $expire = $('[name="expire"]');
  const $code = $('[name="invitationCode"]');
  function updateFormState() {
    const method = +$('[name="method"]').val();
    $role.prop('disabled', method === domainEnum.JOIN_METHOD_NONE).trigger('vjFormDisableUpdate');
    $expire.prop('disabled', method === domainEnum.JOIN_METHOD_NONE).trigger('vjFormDisableUpdate');
    $code.prop('disabled', method !== domainEnum.JOIN_METHOD_CODE).trigger('vjFormDisableUpdate');
  }
  updateFormState();
  $('[name="method"]').on('change', updateFormState);
});

export default page;
