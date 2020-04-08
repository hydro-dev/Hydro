// Modified from jquery-pjax to support multiple fragments and jQuery 3.0
// https://github.com/defunkt/jquery-pjax/blob/master/jquery.pjax.js

import uuid from 'uuid/v4';

import Notification from 'vj/components/notification';
import NProgress from 'vj/components/nprogress';
import request from './request';

const pjax = {};

let currentState = null;
let currentXHR = null;
let inProgress = 0;

function cancelLastXHR() {
  if (currentXHR && currentXHR.readyState < 4) {
    currentXHR.abort();
    currentXHR = null;
  }
}

function canonicalizeUrl(url) {
  const a = document.createElement('a');
  a.href = url;
  return a.href;
}

function extractMetaData(requestOption, response) {
  const metaData = {
    title: response.title ? response.title : document.title,
    url: response.url ? response.url : requestOption.url,
  };
  metaData.url = canonicalizeUrl(metaData.url);
  return metaData;
}

function incProgress() {
  inProgress++;
  NProgress.done();
  NProgress.start();
}

function decProgress() {
  inProgress--;
  if (inProgress === 0) {
    NProgress.done();
  }
}

pjax.request = async (opt) => {
  const options = {
    method: 'get',
    push: true,
    ...opt,
  };
  if (!currentState) {
    // create initial state
    currentState = {
      id: uuid(),
      options: {
        url: window.location.href,
      },
    };
    window.history.replaceState(currentState, null);
  }
  cancelLastXHR();
  if (options.push) {
    // in popstate, options.push === false
    window.history.pushState(null, null, options.url);
  }
  incProgress();
  try {
    const data = await request.ajax({
      beforeSend(xhr) {
        currentXHR = xhr;
      },
      ...options,
    });
    const meta = extractMetaData(options, data);
    currentState = {
      id: uuid(),
      options: opt,
    };
    if (options.push) {
      window.history.replaceState(currentState, null, meta.url);
    }
    document.title = meta.title;
    data.fragments.forEach((fragment) => {
      if (process.env.NODE_ENV !== 'production') {
        if (fragment.html === undefined) {
          // eslint-disable-next-line quotes
          throw new Error(`Fragement should contain 'html'`);
        }
      }
      const $el = $(fragment.html.trim());
      if (process.env.NODE_ENV !== 'production') {
        if ($el.length === 0) {
          // eslint-disable-next-line quotes
          throw new Error(`Unable to build elements from fragment 'html'`);
        }
      }
      const fragmentId = $el.attr('data-fragment-id');
      if (process.env.NODE_ENV !== 'production') {
        if (!fragmentId) {
          // eslint-disable-next-line quotes
          throw new Error(`Unable to extract fragment id from fragment 'html'`);
        }
      }
      const $target = $(`[data-fragment-id="${fragmentId}"]`);
      if (process.env.NODE_ENV !== 'production') {
        if ($target.length === 0) {
          // eslint-disable-next-line quotes
          throw new Error(`Unable to get target fragment from fragment id`);
        }
      }
      $target.trigger('vjContentRemove');
      $target.replaceWith($el);
      $el.trigger('vjContentNew');
    });
  } catch (err) {
    if (!err.aborted) {
      Notification.error(err.message);
      console.log(err);
    }
  } finally {
    decProgress();
  }
};

function handlePopState(ev) {
  if (!ev.originalEvent) {
    return;
  }
  const { state } = ev.originalEvent;
  if (!state) {
    return;
  }
  if (!state.id || (currentState && state.id === currentState.id)) {
    return;
  }
  pjax.request({
    ...state.options,
    push: false,
  });
}

$(window).on('popstate', handlePopState);

export default pjax;
