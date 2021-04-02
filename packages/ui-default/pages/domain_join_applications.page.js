import { NamedPage } from 'vj/misc/Page';
import * as domainEnum from 'vj/constant/domain';

const page = new NamedPage('domain_join_applications', () => {
  const $role = $('[name="role"]');
  const $expire = $('[name="expire"]');
  const $code = $('[name="invitationCode"]');
  function updateFormState() {
    const method = parseInt($('[name="method"]').val(), 10);
    $role.prop('disabled', method === domainEnum.JOIN_METHOD_NONE).trigger('vjFormDisableUpdate');
    $expire.prop('disabled', method === domainEnum.JOIN_METHOD_NONE).trigger('vjFormDisableUpdate');
    $code.prop('disabled', method !== domainEnum.JOIN_METHOD_CODE).trigger('vjFormDisableUpdate');
  }
  updateFormState();
  $('[name="method"]').change(() => updateFormState());
});

export default page;
