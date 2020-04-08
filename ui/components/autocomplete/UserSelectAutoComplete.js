import _ from 'lodash';
import tpl from 'vj/utils/tpl';
import request from 'vj/utils/request';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import AutoComplete from '.';

function getText(user) {
  return user.uname;
}

function getItems(val) {
  return request.get('/user/search', { q: val });
}

function renderItem(user) {
  return tpl`
    <div class="media">
      <div class="media__left medium">
        <img class="small user-profile-avatar" src="${user.gravatar_url}" width="30" height="30">
      </div>
      <div class="media__body medium">
        <div class="user-select__uname">${user.uname}</div>
        <div class="user-select__uid">UID = ${user._id}</div>
      </div>
    </div>
  `;
}

export default class UserSelectAutoComplete extends AutoComplete {
  static DOMAttachKey = 'vjUserSelectAutoCompleteInstance';

  constructor($dom, options) {
    super($dom, {
      classes: 'user-select',
      items: getItems,
      render: renderItem,
      text: getText,
      ...options,
    });
  }
}

_.assign(UserSelectAutoComplete, DOMAttachedObject);
