export class Page {
  constructor(name, autoload, afterLoading, beforeLoading) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof name !== 'string' && !(name instanceof Array)) {
        // eslint-disable-next-line quotes
        throw new Error(`'name' should be a string or string[]`);
      }
      if (typeof afterLoading !== 'function' && afterLoading != null) {
        // eslint-disable-next-line quotes
        throw new Error(`'afterLoading' should be a function`);
      }
      if (typeof beforeLoading !== 'function' && beforeLoading != null) {
        // eslint-disable-next-line quotes
        throw new Error(`'beforeLoading' should be a function`);
      }
    }
    this.name = name;
    this.autoload = autoload;
    this.afterLoading = afterLoading;
    this.beforeLoading = beforeLoading;
  }

  isNameMatch(name) {
    if (typeof this.name === 'string') {
      return this.name === name;
    }
    if (this.name instanceof Array) {
      return this.name.indexOf(name) !== -1;
    }
    return false;
  }
}

export class NamedPage extends Page {
  constructor(name, afterLoading = null, beforeLoading = null) {
    super(name, false, afterLoading, beforeLoading);
  }
}

export class AutoloadPage extends Page {
  constructor(name, afterLoading = null, beforeLoading = null) {
    super(name, true, afterLoading, beforeLoading);
  }
}

window.Hydro.NamedPage = NamedPage;
window.Hydro.AutoloadPage = AutoloadPage;
