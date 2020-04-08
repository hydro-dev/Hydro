import _ from 'lodash';
import tpl from 'vj/utils/tpl';
import request from 'vj/utils/request';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import AutoComplete from '.';

function getText(domain) {
  return domain._id;
}

function getItems(val) {
  return request.get('/domain/search', { q: val });
}

function renderItem(domain) {
  return tpl`
    <div class="media">
      <div class="media__left medium">
        <img class="small domain-profile-avatar" src="${domain.gravatar_url}" width="30" height="30">
      </div>
      <div class="media__body medium">
        <div class="domain-select__name">${domain.name}</div>
        <div class="domain-select__id">ID = ${domain._id}</div>
      </div>
    </div>
  `;
}

export default class DomainSelectAutoComplete extends AutoComplete {
  static DOMAttachKey = 'vjDomainSelectAutoCompleteInstance';

  constructor($dom, options) {
    super($dom, {
      classes: 'domain-select',
      items: getItems,
      render: renderItem,
      text: getText,
      ...options,
    });
  }
}

_.assign(DomainSelectAutoComplete, DOMAttachedObject);
