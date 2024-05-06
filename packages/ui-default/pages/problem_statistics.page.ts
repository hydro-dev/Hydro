import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('problem_statistics', () => {
  $('[name="filter-form"] [name="type"]').on('change', () => {
    $('[name="filter-form"]').trigger('submit');
  });
});

export default page;
