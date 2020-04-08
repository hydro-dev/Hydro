import { AutoloadPage } from 'vj/misc/PageLoader';
import StyledTable from './StyledTable';

const styledTablePage = new AutoloadPage('styledTablePage', () => {
  StyledTable.registerLifeCycleHooks();
});

export default styledTablePage;
