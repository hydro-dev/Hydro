import _ from 'lodash';
import tpl from 'vj/utils/tpl';
import request from 'vj/utils/request';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import AutoComplete from '.';

function getText(pdoc) {
    return pdoc.docId;
}

function getItems(val) {
    return request.get('/problem/list', { q: val });
}

function renderItem(pdoc) {
    return tpl`
    <div class="media">
      <div class="media__body medium">
        <div class="problem-select__name">${pdoc.pid ? `${pdoc.pid}` : ''}${pdoc.title}</div>
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

_.assign(ProblemSelectAutoComplete, DOMAttachedObject);
window.Hydro.components.UserSelectAutoComplete = ProblemSelectAutoComplete;
