import { AutoloadPage } from 'vj/misc/Page';
import Tab from './Tab';

const tabPage = new AutoloadPage('tabPage', () => {
  Tab.initAll();
  Tab.initEventListeners();
});

export default tabPage;
