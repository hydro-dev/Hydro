import $ from 'jquery';
import _ from 'lodash';
import React from 'react';
import ReactDOM from 'react-dom/client';
import DOMServer from 'react-dom/server';

export function substitute(str: string, obj: any) {
  return str.replace(/\{([^{}]+)\}/g, (match, key) => {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key].toString();
    return `{${key}}`;
  });
}

export function i18n(str: string, ...params: any[]) {
  if (!str) return '';
  return substitute((window as any).LOCALES?.[str] || str, params);
}

export function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

const defaultDict = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

export function secureRandomString(digit = 32, dict = defaultDict) {
  let result = '';
  const crypto = window.crypto || (window as any).msCrypto;
  if (!crypto?.getRandomValues) throw new Error('crypto.getRandomValues not supported');
  const array = new Uint32Array(digit);
  crypto.getRandomValues(array);
  for (let i = 0; i < digit; i++) result += dict[array[i] % dict.length];
  return result;
}

type Substitution = string | number | { templateRaw: true, html: string };

export function tpl<T extends boolean = false>(node: React.ReactNode, reactive?: T): T extends true ? HTMLDivElement : string;
export function tpl(pieces: TemplateStringsArray, ...substitutions: Substitution[]): string;
export function tpl(pieces: TemplateStringsArray | React.ReactNode, ...substitutions: Substitution[] | boolean[]) {
  if (React.isValidElement(pieces)) {
    if (substitutions[0]) {
      const div = document.createElement('div');
      ReactDOM.createRoot(div).render(pieces);
      return div;
    }
    return DOMServer.renderToStaticMarkup(pieces);
  }
  let result = pieces[0];
  for (let i = 0; i < substitutions.length; ++i) {
    const subst = substitutions[i];
    let substHtml: string;
    if (subst && typeof subst === 'object' && subst.templateRaw) {
      substHtml = subst.html;
    } else substHtml = _.escape(String(subst));
    result += substHtml + pieces[i + 1];
  }
  return result;
}

tpl.typoMsg = function (msg: string, raw = false) {
  if (raw) return `<div class="typo"><p>${msg}</p></div>`;
  const lines = msg.trim().split('\n');
  return `<div class="typo">${lines.map((i) => `<p>${_.escape(i)}</p>`).join('\n')}</div>`;
};

export function rawHtml(html: string) {
  return {
    templateRaw: true,
    html,
  };
}

let zIndexCurrent = 1000;

export const zIndexManager = {
  getCurrent() {
    return zIndexCurrent;
  },
  getNext() {
    return ++zIndexCurrent;
  },
};

export function addSpeculationRules(rules) {
  if (HTMLScriptElement.supports?.('speculationrules')) {
    const specScript = document.createElement('script');
    specScript.type = 'speculationrules';
    specScript.textContent = JSON.stringify(rules);
    document.body.append(specScript);
  }
}

export const request = {
  ajax(options: Record<string, any>) {
    const stack = new Error().stack;
    return new Promise<any>((resolve, reject) => {
      $
        .ajax({
          dataType: 'json',
          headers: {
            Accept: 'application/json',
          },
          ...options,
        })
        .fail((jqXHR, textStatus, errorThrown: any) => {
          if (textStatus === 'abort') {
            const err = new Error(i18n('Aborted')) as any;
            err.aborted = true;
            err.isUserFacingError = true;
            reject(err);
          } else if (jqXHR.readyState === 0) {
            const err = new Error(i18n('Network error')) as any;
            err.isUserFacingError = true;
            reject(err);
          } else if (typeof jqXHR.responseJSON === 'object' && jqXHR.responseJSON.error) {
            const { error } = jqXHR.responseJSON;
            if (error.params) {
              const message = i18n(error.message, ...error.params);
              const err = new Error(message === error.message && error.params.length
                ? `${error.message}: ${error.params.join(' ')}`
                : message) as any;
              err.rawMessage = error.message;
              err.params = error.params;
              reject(err);
            } else reject(new Error(jqXHR.responseJSON.error.message));
          } else if (errorThrown instanceof Error) {
            reject(errorThrown);
          } else {
            reject(new Error(textStatus));
          }
        })
        .done(resolve);
    }).catch((e: Error) => {
      e.stack = stack;
      throw e;
    });
  },

  postFile(url: string, form: FormData, options: any = {}) {
    return this.ajax({
      url,
      data: form,
      processData: false,
      contentType: false,
      type: 'POST',
      dataType: undefined,
      ...options,
    });
  },

  post(url: string, dataOrForm: JQueryStatic | Node | string | Record<string, any> = {}, options: any = {}) {
    let postData;
    // @ts-ignore
    if (dataOrForm instanceof $ && dataOrForm.is('form')) {
      // $form
      postData = (dataOrForm as any).serialize();
    } else if (dataOrForm instanceof Node && $(dataOrForm).is('form')) {
      // form
      postData = $(dataOrForm).serialize();
    } else if (typeof dataOrForm === 'string') {
      // foo=bar&box=boz
      postData = dataOrForm;
    } else {
      // {foo: 'bar'}
      postData = JSON.stringify(dataOrForm);
      options.contentType = 'application/json';
    }
    return request.ajax({
      url,
      method: 'post',
      data: postData,
      ...options,
    });
  },

  get(url: string, qs: Record<string, any> = {}, options: Record<string, any> = {}) {
    return request.ajax({
      url,
      data: qs,
      method: 'get',
      ...options,
    });
  },
};

export async function withTransitionCallback(callback: () => (Promise<void> | void)) {
  // @ts-ignore
  if (!document.startViewTransition) return callback?.();
  // @ts-ignore
  const transition = document.startViewTransition(callback);
  return await transition.finished;
}

export async function setTemporaryViewTransitionNames(entries, vtPromise: Promise<void>) {
  for (const [$el, name] of entries) {
    $el.style.viewTransitionName = name;
  }
  await vtPromise;
  for (const [$el] of entries) {
    $el.style.viewTransitionName = '';
  }
}

export function getTheme(): 'dark' | 'light' {
  return ['light', 'dark'].includes(UserContext.theme) ? UserContext.theme : 'light';
}
