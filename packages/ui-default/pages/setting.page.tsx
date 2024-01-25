import yaml from 'js-yaml';
import Schema from 'schemastery';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { request } from 'vj/utils';

const page = new NamedPage('manage_config', async () => {
  const schema = new Schema(UiContext.schema);
  setInterval(() => {
    try {
      const v = yaml.load($('#config').val().toString());
      schema(v);
      $('#info').text('');
    } catch (e) {
      console.debug(e);
      $('#info').text(e.message);
    }
  }, 1000);
  $('#submit').on('click', () => {
    const value = $('#config').val();
    request.post('', { value }).then(() => {
      Notification.success('保存成功');
    }).catch((e) => {
      Notification.error('保存失败:', e.message);
    });
  });
});

export default page;
