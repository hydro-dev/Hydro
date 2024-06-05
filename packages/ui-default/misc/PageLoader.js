import pages from '../__glob_page';
import { Page } from './Page';

export default class PageLoader {
  constructor() {
    this.pageInstances = [
      ...pages,
      ...window.Hydro.extraPages,
    ].map((page) => {
      page = page?.default || page;
      if (!page || !(page instanceof Page)) return null;
      return page;
    }).filter((i) => i);
    window.Hydro.pageInstances = this.pageInstances;
    window.Hydro.extraPages.filter((i) => !(i instanceof Page)).forEach((i) => i());
  }

  getAutoloadPages() {
    return this.pageInstances.filter((page) => page && page.autoload);
  }

  getNamedPage(pageName) {
    return this.pageInstances.filter((page) => page && page.isNameMatch(pageName));
  }

  getPage(moduleName) {
    return this.pageInstances.filter((page) => page && page.moduleName === moduleName);
  }
}
