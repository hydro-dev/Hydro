import { NamedPage } from 'vj/misc/PageLoader';

const page = new NamedPage('contest_main', () => {
  // Contest Filter
  $('[name="filter-form"] [name="rule"]').change(() => {
    $('[name="filter-form"]').submit();
  });
});

export default page;
