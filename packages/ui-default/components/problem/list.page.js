import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';

export default new AutoloadPage('problemListPage', () => {
  $('.col--problem-name>a').attr('target', '_blank');
  $(document).on('vjContentNew', () => {
    $('.col--problem-name>a').attr('target', '_blank');
  });
});
