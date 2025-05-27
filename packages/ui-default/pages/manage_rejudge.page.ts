import { STATUS_TEXTS } from '@hydrooj/common';
import $ from 'jquery';
import CustomSelectAutoComplete from 'vj/components/autocomplete/CustomSelectAutoComplete';
import ProblemSelectAutoComplete from 'vj/components/autocomplete/ProblemSelectAutoComplete';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('manage_rejudge', async () => {
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
  CustomSelectAutoComplete.getOrConstruct($('[name=lang]'), { multi: true, data: langs });
  const statuses = Object.values(STATUS_TEXTS).map((i) => ({ name: i, _id: i }));
  CustomSelectAutoComplete.getOrConstruct($('[name=status]'), { multi: true, data: statuses });
});

export default page;
