import { Page } from './Page';

export default class PageLoader {
  constructor() {
    const pages = require.context('../pages/', true, /\.page\.[jt]sx?$/i);
    const components = require.context('../components/', true, /\.page\.[jt]sx?$/i);
    this.pageInstances = [
      ...pages.keys().map((key) => {
        const page = pages(key).default;
        if (!page || !(page instanceof Page)) return null;
        return page;
      }),
      ...components.keys().map((key) => {
        const page = components(key).default;
        if (!page || !(page instanceof Page)) return null;
        return page;
      }),
    ];
    if (window.Hydro.extraPages) this.pageInstances.push(...window.Hydro.extraPages.filter((i) => i instanceof Page));
    window.Hydro.pageInstances = this.pageInstances;
    window.Hydro.extraPages.filter((i) => !(i instanceof Page)).forEach((i) => i());
  }

  getAutoloadPages() {
    return this.pageInstances.filter((page) => page && page.autoload);
  }

  getNamedPage(pageName) {
    return this.pageInstances.filter((page) => page && page.isNameMatch(pageName));
  }
}
