import CustomSelectAutoComplete from 'vj/components/autocomplete/CustomSelectAutoComplete';
import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('domain_edit', () => {
  const prefixes = new Set(Object.keys(window.LANGS).filter((i) => i.includes('.')).map((i) => i.split('.')[0]));
  const langs = Object.keys(window.LANGS).filter((i) => !prefixes.has(i)).map((i) => (
    { name: `${i.includes('.') ? `${window.LANGS[i.split('.')[0]].display}/` : ''}${window.LANGS[i].display}`, _id: i }
  ));

  const $langSelect = $('[name=langs]');
  $langSelect.val(($langSelect.val() as string).split(',').filter((i) => !prefixes.has(i)));

  const select: CustomSelectAutoComplete<true> = CustomSelectAutoComplete.getOrConstruct($('[name=langs]'), { multi: true, data: langs });
  select.onChange((val) => {
    const value = val.split(',');
    value.push(...new Set(value.filter((i) => i.includes('.')).map((i) => i.split('.')[0])));
    $langSelect.val(value.join(','));
  });
});

export default page;
