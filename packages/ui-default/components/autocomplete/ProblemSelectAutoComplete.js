import { assign } from 'lodash';
import tpl from 'vj/utils/tpl';
import request from 'vj/utils/request';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import AutoComplete from './index';

function getText(pdoc) {
  return pdoc.docId;
}

function getItems(prefix) {
  return request.get(`/d/${UiContext.domainId}/problem/list`, { prefix });
}

function renderItem(pdoc) {
  return tpl`
    <div class="media">
      <div class="media__body medium">
        <div class="problem-select__name">${pdoc.pid ? `${pdoc.pid} ` : ''}${pdoc.title}</div>
        <div class="problem-select__id">ID = ${pdoc.docId}</div>
      </div>
    </div>
  `;
}

export default class ProblemSelectAutoComplete extends AutoComplete {
  static DOMAttachKey = 'vjProblemSelectAutoCompleteInstance';

  constructor($dom, options) {
    super($dom, {
      classes: 'problem-select',
      items: getItems,
      render: renderItem,
      text: getText,
      ...options,
    });
  }
}

assign(ProblemSelectAutoComplete, DOMAttachedObject);
window.Hydro.components.ProblemSelectAutoComplete = ProblemSelectAutoComplete;
