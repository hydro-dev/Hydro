import $ from 'jquery';
import CustomSelectAutoComplete from 'vj/components/autocomplete/CustomSelectAutoComplete';
import ProblemSelectAutoComplete from 'vj/components/autocomplete/ProblemSelectAutoComplete';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { delay, i18n, request } from 'vj/utils';

const page = new NamedPage('manage_bulk_rejudge', async () => {
  UserSelectAutoComplete.getOrConstruct($('[name="uidOrName"]'), {
    clearDefaultValue: false,
  });
  ProblemSelectAutoComplete.getOrConstruct($('[name="pid"]'), {
    clearDefaultValue: false,
  });
  const prefixes = new Set(Object.keys(window.LANGS).filter((i) => i.includes('.')).map((i) => i.split('.')[0]));
  const langs = Object.keys(window.LANGS).filter((i) => !prefixes.has(i)).map((i) => (
    { name: `${i.includes('.') ? `${window.LANGS[i.split('.')[0]].display}/` : ''}${window.LANGS[i].display}`, _id: i }
  ));
  CustomSelectAutoComplete.getOrConstruct($('[name=lang]'), { multi: false, data: langs });

  async function post(draft) {
    try {
      const res = await request.post('', {
        pid: $('[name="pid"]').val(),
        tid: $('[name="tid"]').val(),
        uidOrName: $('[name="uidOrName"]').val(),
        lang: $('[name="lang"]').val(),
        draft,
      });
      if (!draft) {
        Notification.success(i18n('Rejudge request submitted.'));
        await delay(2000);
        window.location.reload();
      } else {
        $('[name="message"]').text(res.message);
      }
    } catch (error) {
      Notification.error(error.message);
    }
  }

  $('[name="preview"]').on('click', () => post(true));
  $('[name="submit"]').on('click', () => post(false));
});

export default page;
