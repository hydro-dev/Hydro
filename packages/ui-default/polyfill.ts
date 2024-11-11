import 'core-js/stable';
import 'matchmedia-polyfill';

import browserUpdate from 'browser-update';

browserUpdate({
  required: {
    e: -10, f: -10, o: -3, s: -1, c: -10,
  },
  insecure: true,
  api: 2022.03,
  url: 'https://google.cn/chrome/',
  jsshowurl: '/browser-update.js',
});

// monaco-editor requires this polyfill
if (window.MediaQueryList && !MediaQueryList.prototype.addEventListener) {
  MediaQueryList.prototype.addEventListener = (k, listener) => {
    MediaQueryList.prototype.addListener(listener);
  };
}
if (typeof window['WeakRef'] === 'undefined') {
  // @ts-ignore
  window.WeakRef = (function (wm) {
    function WeakRef(target) {
      wm.set(this, target);
    }
    WeakRef.prototype.deref = function () {
      return wm.get(this);
    };
    return WeakRef;
  }(new WeakMap()));
}
if (!(window.matchMedia('all').addListener || window.matchMedia('all').addEventListener)) {
  const localMatchMedia = window.matchMedia;
  const hasMediaQueries = localMatchMedia('only all').matches;
  let isListening = false;
  let timeoutID;
  const queries = [];
  const handleChange = function () {
    clearTimeout(timeoutID);
    timeoutID = setTimeout(() => {
      for (let i = 0, il = queries.length; i < il; i++) {
        const { mql } = queries[i];
        const listeners = queries[i].listeners || [];
        const { matches } = localMatchMedia(mql.media);
        if (matches !== mql.matches) {
          mql.matches = matches;
          for (let j = 0, jl = listeners.length; j < jl; j++) {
            listeners[j].call(window, mql);
          }
        }
      }
    }, 30);
  };
  window.matchMedia = function (media) {
    const mql = localMatchMedia(media);
    const listeners = [];
    let index = 0;
    if (!mql.addListener) {
      mql.addListener = function (listener) {
        if (!hasMediaQueries) return;
        if (!isListening) {
          isListening = true;
          window.addEventListener('resize', handleChange, true);
        }
        if (index === 0) {
          index = queries.push({
            mql,
            listeners,
          });
        }
        listeners.push(listener);
      };
      mql.removeListener = function (listener) {
        for (let i = 0, il = listeners.length; i < il; i++) {
          if (listeners[i] === listener) {
            listeners.splice(i, 1);
            i--;
          }
        }
      };
    }
    if (!mql.addEventListener) {
      mql.addEventListener = (k, listener) => mql.addListener(listener);
      mql.removeEventListener = (k, listener) => mql.removeListener(listener);
    }
    return mql;
  };
}
