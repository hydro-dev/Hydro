import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('contest_main', () => {
  $('[name="filter-form"] [name="rule"]').on('change', () => {
    $('[name="filter-form"]').trigger('submit');
  });
});

export default page;
