import { prompt } from 'vj/components/dialog';
import { i18n } from 'vj/utils';

export default async function selectUser() {
  const res = await prompt(i18n('Select User'), {
    user: {
      type: 'user',
      label: i18n('Username / UID'),
      required: true,
      autofocus: true,
    },
  });
  return res?.user;
}

window.Hydro.components.selectUser = selectUser;
