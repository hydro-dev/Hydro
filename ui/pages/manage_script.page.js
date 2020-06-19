import { NamedPage } from 'vj/misc/PageLoader';
import Notification from 'vj/components/notification';
import { ActionDialog } from 'vj/components/dialog';

import request from 'vj/utils/request';

const page = new NamedPage('manage_script', () => {
  const runScriptDialog = new ActionDialog({
    $body: $('.dialog__body--run-script > div'),
    onDispatch(action) {
      const $args = runScriptDialog.$dom.find('[name="args"]');
      if (action === 'ok' && $args.val() === '') {
        $args.focus();
        return false;
      }
      return true;
    },
  });
  runScriptDialog.clear = function () {
    this.$dom.find('[name="args"]').val('');
    return this;
  };

  window.runScript = async function (id) {
    const action = await runScriptDialog.clear().open();
    if (action !== 'ok') return;
    const args = runScriptDialog.$dom.find('[name="args"]').val();
    try {
      const res = await request.post('', {
        args,
        id,
      });
      window.location.href = res.url;
    } catch (error) {
      Notification.error(error.message);
    }
  };
});

export default page;
