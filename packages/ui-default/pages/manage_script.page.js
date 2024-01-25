import $ from 'jquery';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { request } from 'vj/utils';

const page = new NamedPage('manage_script', () => {
  const runScriptDialog = new ActionDialog({
    $body: $('.dialog__body--run-script > div'),
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
