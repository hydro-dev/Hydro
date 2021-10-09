export class Page {
  constructor(public name: string | string[], public autoload: boolean, public afterLoading, public beforeLoading) {
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
  }

  isNameMatch(name: string) {
    if (typeof this.name === 'string') return this.name === name;
    if (this.name instanceof Array) return this.name.includes(name);
    return false;
  }
}

export class NamedPage extends Page {
  constructor(name: string | string[], afterLoading = null, beforeLoading = null) {
    super(name, false, afterLoading, beforeLoading);
  }
}

export class AutoloadPage extends Page {
  constructor(name: string | string[], afterLoading = null, beforeLoading = null) {
    super(name, true, afterLoading, beforeLoading);
  }
}

window.Hydro.NamedPage = NamedPage;
window.Hydro.AutoloadPage = AutoloadPage;
