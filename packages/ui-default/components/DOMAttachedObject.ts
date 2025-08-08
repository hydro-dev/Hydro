import $ from 'jquery';

let removalChecker = null;
const res = [];

function checkResources() {
  for (let i = res.length - 1; i >= 0; --i) {
    if (res[i].detached || !document.body.contains(res[i].$dom[0])) {
      if (!res[i].detached) res[i].detach();
      res.splice(i, 1);
    }
  }
  if (res.length === 0) {
    clearInterval(removalChecker);
    removalChecker = null;
  }
}

function monitorResource(resource) {
  res.push(resource);
  if (removalChecker === null) {
    removalChecker = setInterval(checkResources, 500);
  }
}

export default class DOMAttachedObject {
  static uniqueIdCounter = 0;
  static DOMAttachKey: string;
  static DOMAttachSelector: string;
  static DOMDetachSelector: string;
  // FIXME should be JQuery<HTMLElement>, but typings for $.transition() wasn't found
  $dom: any;
  id: number;
  detached: boolean;
  eventNS: string;

  static get($obj) {
    const key = this.DOMAttachKey;
    return $obj.data(key);
  }

  static getOrConstruct<T = DOMAttachedObject>($obj, ...args): T {
    const $singleObj = $obj.eq(0);
    const key = this.DOMAttachKey;
    const Protoclass = this as any;
    const instance = this.get($singleObj);
    if (instance !== undefined) return instance;
    const newInstance = new Protoclass($singleObj, ...args);
    // $dom may be updated in constructor so that we use $dom instead
    // of $singleObj here.
    if (!newInstance.$dom) return null;
    newInstance.$dom.data(key, newInstance);
    return newInstance;
  }

  static attachAll(container: Document | HTMLElement = document.body, ...args) {
    if (process.env.NODE_ENV !== 'production') {
      if (!this.DOMAttachSelector) {
        throw new Error("'DOMAttachSelector' should be specified");
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      console.time(`DOMAttachedObject[${this.DOMAttachKey}]: attachAll`);
    }
    $(container)
      .find(this.DOMAttachSelector)
      .addBack(this.DOMAttachSelector)
      .get()
      .forEach((element) => this.getOrConstruct($(element), ...args));
    if (process.env.NODE_ENV !== 'production') {
      console.timeEnd(`DOMAttachedObject[${this.DOMAttachKey}]: attachAll`);
    }
  }

  static detachAll(container: Document | HTMLElement = document.body) {
    const selector = this.DOMDetachSelector || this.DOMAttachSelector;
    if (process.env.NODE_ENV !== 'production') {
      if (!selector) {
        throw new Error("'DOMDetachSelector' or 'DOMAttachSelector' should be specified");
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      console.time(`DOMAttachedObject[${this.DOMAttachKey}]: detachAll`);
    }
    $(container)
      .find(selector)
      .addBack(selector)
      .get()
      .forEach((element) => {
        const instance = this.get($(element));
        if (instance) {
          instance.detach();
        }
      });
    if (process.env.NODE_ENV !== 'production') {
      console.timeEnd(`DOMAttachedObject[${this.DOMAttachKey}]: detachAll`);
    }
  }

  static registerLifeCycleHooks(attach = true) {
    if (process.env.NODE_ENV !== 'production') {
      if (!this.DOMAttachSelector) {
        throw new Error("'DOMAttachSelector' should be specified");
      }
    }
    $(document).on('vjContentNew', (e) => this.attachAll(e.target));
    $(document).on('vjContentRemove', (e) => this.detachAll(e.target));
    if (attach) {
      this.attachAll();
    }
  }

  detach() {
    if ((this.constructor as any).DOMAttachKey) {
      this.$dom.removeData((this.constructor as any).DOMAttachKey);
    }
    this.detached = true;
  }

  constructor($dom: JQuery<HTMLElement>, monitorDetach = false) {
    if ($dom == null) return null;
    this.$dom = $dom;
    this.id = ++DOMAttachedObject.uniqueIdCounter;
    this.eventNS = `vj4obj_${this.id}`;
    this.detached = false;
    if (monitorDetach) monitorResource(this);
  }
}
