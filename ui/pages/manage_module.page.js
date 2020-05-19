import { NamedPage } from 'vj/misc/PageLoader';
import Notification from 'vj/components/notification';
import { ActionDialog } from 'vj/components/dialog';

import request from 'vj/utils/request';

const page = new NamedPage('manage_module', () => {
  const addModuleDialog = new ActionDialog({
    $body: $('.dialog__body--add-module > div'),
    onDispatch(action) {
      const $url = addModuleDialog.$dom.find('[name="url"]');
      if (action === 'ok' && $url.val() === '') {
        $url.focus();
        return false;
      }
      return true;
    },
  });
  addModuleDialog.clear = function () {
    this.$dom.find('[name="url"]').val('');
    this.$dom.find('[name="id"]').val('');
    return this;
  };

  async function handleClickAddModule() {
    const action = await addModuleDialog.clear().open();
    if (action !== 'ok') return;
    const url = addModuleDialog.$dom.find('[name="url"]').val();
    const id = addModuleDialog.$dom.find('[name="id"]').val();
    try {
      await request.post('', {
        operation: 'install',
        url,
        id,
      });
      window.location.reload();
    } catch (error) {
      Notification.error(error.message);
    }
  }

  $('[name="add_module"]').click(() => handleClickAddModule());
});

export default page;
