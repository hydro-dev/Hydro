import i18n from './i18n';
import substitute from './substitute';

const request = {
  /**
   * @param {object} options
   */
  async ajax(options) {
    return new Promise((resolve, reject) => {
      $
        .ajax({
          dataType: 'json',
          ...options,
        })
        .fail((jqXHR, textStatus, errorThrown) => {
          if (textStatus === 'abort') {
            const err = new Error(i18n('Aborted'));
            err.aborted = true;
            reject(err);
          } else if (jqXHR.readyState === 0) {
            reject(new Error(i18n('Network error')));
          } else if (errorThrown instanceof Error) {
            reject(errorThrown);
          } else if (typeof jqXHR.responseJSON === 'object' && jqXHR.responseJSON.error) {
            const error = jqXHR.responseJSON.error;
            if (error.params) {
              const message = substitute(error.message, ...error.params);
              const err = new Error(message);
              err.rawMessage = error.message;
              err.params = error.params;
              reject(err);
            } else reject(new Error(jqXHR.responseJSON.error.message));
          } else {
            reject(new Error(textStatus));
          }
        })
        .done(resolve);
    });
  },

  /**
   * @param {string} url
   * @param {FormData} FormData
   */
  postFile(url, form) {
    return this.ajax({
      url,
      data: form,
      processData: false,
      contentType: false,
      type: 'POST',
      dataType: undefined,
    });
  },

  /**
   * @param {string} url
   * @param {JQueryStatic | Node | string | object} dataOrForm
   * @param {object} options
   */
  post(url, dataOrForm = {}, options = {}) {
    let postData;
    if (dataOrForm instanceof jQuery && dataOrForm.is('form')) {
      // $form
      postData = dataOrForm.serialize();
    } else if (dataOrForm instanceof Node && $(dataOrForm).is('form')) {
      // form
      postData = $(dataOrForm).serialize();
    } else if (typeof dataOrForm === 'string') {
      // foo=bar&box=boz
      postData = dataOrForm;
    } else {
      // {foo: 'bar'}
      postData = $.param({
        csrfToken: UiContext.csrfToken,
        ...dataOrForm,
      }, true);
    }
    return request.ajax({
      url,
      method: 'post',
      data: postData,
      ...options,
    });
  },

  /**
   * @param {string} url
   * @param {object} qs
   * @param {object} options
   */
  get(url, qs = {}, options = {}) {
    return request.ajax({
      url,
      data: qs,
      method: 'get',
      ...options,
    });
  },
};

export default request;
window.Hydro.utils.request = request;
