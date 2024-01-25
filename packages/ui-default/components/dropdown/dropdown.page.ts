import { AutoloadPage } from 'vj/misc/Page';
import Dropdown from './Dropdown';

const dropdownPage = new AutoloadPage('dropdownPage', () => {
  Dropdown.registerLifeCycleHooks();
});

export default dropdownPage;
