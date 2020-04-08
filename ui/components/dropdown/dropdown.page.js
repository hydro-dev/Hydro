import { AutoloadPage } from 'vj/misc/PageLoader';
import Dropdown from './Dropdown';

const dropdownPage = new AutoloadPage('dropdownPage', () => {
  Dropdown.registerLifeCycleHooks();
});

export default dropdownPage;
