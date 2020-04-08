import { AutoloadPage } from 'vj/misc/PageLoader';
import Tab from './Tab';

const tabPage = new AutoloadPage('tabPage', () => {
  Tab.initAll();
  Tab.initEventListeners();
});

export default tabPage;
