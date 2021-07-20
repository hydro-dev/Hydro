import { AutoloadPage } from 'vj/misc/Page';

export default new AutoloadPage('problemListPage', () => {
    $('.col--problem-name>a').attr('target', '_blank');
});
