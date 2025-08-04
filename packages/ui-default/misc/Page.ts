type Callback = (pagename: string, loadPage: (name: string) => Promise<any>) => any;

export class Page {
  moduleName?: string;
  autoload = false;
  afterLoading?: Callback;
  beforeLoading?: Callback;
  constructor(pagename: string | string[], afterLoading?: Callback, beforeLoading?: Callback);
  constructor(pagename: string | string[], moduleName: string, afterLoading?: Callback, beforeLoading?: Callback);
  constructor(pagename: string | string[], ...args: any[]);
  constructor(public name: string | string[], ...args: any[]) {
    if (typeof args[0] === 'string') {
      [this.moduleName, this.afterLoading, this.beforeLoading] = args;
    } else {
      [this.afterLoading, this.beforeLoading] = args;
    }
    if (process.env.NODE_ENV !== 'production') {
      if (typeof name !== 'string' && !(name instanceof Array)) {
        throw new TypeError("'name' should be a string or string[]");
      }
      if (typeof this.afterLoading !== 'function' && this.afterLoading != null) {
        throw new Error("'afterLoading' should be a function");
      }
      if (typeof this.beforeLoading !== 'function' && this.beforeLoading != null) {
        throw new Error("'beforeLoading' should be a function");
      }
    }
  }

  isNameMatch(name: string) {
    if (typeof this.name === 'string') return this.name === name;
    if (this.name instanceof Array) return this.name.includes(name);
    return false;
  }
}

export class NamedPage extends Page { }

export class AutoloadPage extends Page {
  constructor(pagename: string | string[], afterLoading?: Callback, beforeLoading?: Callback);
  constructor(pagename: string | string[], moduleName: string, afterLoading?: Callback, beforeLoading?: Callback);
  constructor(pagename: string | string[], ...args: any[]) {
    super(pagename, ...args);
    this.autoload = true;
  }
}

window.Hydro.NamedPage = NamedPage;
window.Hydro.AutoloadPage = AutoloadPage;
