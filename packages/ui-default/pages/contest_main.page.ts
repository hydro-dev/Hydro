import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('contest_main', () => {
  $('[name="filter-form"] select').on('change', () => {
    $('[name="filter-form"]').trigger('submit');
  });
});

export default page;
