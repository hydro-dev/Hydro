import _ from 'lodash';
import { NamedPage } from 'vj/misc/PageLoader';
import request from 'vj/utils/request';
import loadReactRedux from 'vj/utils/loadReactRedux';
import parseQueryString from 'vj/utils/parseQueryString';

import { ActionDialog } from 'vj/components/dialog';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';

const page = new NamedPage('home_messages', () => {
  let reduxStore;

  function createDialog(user) {
    const id = _.uniqueId('PLACEHOLDER_');
    reduxStore.dispatch({
      type: 'DIALOGUES_CREATE',
      payload: {
        id,
        user,
      },
    });
    reduxStore.dispatch({
      type: 'DIALOGUES_SWITCH_TO',
      payload: id,
    });
  }

  async function mountComponent() {
    const SockJs = await import('sockjs-client');
    const { default: MessagePadApp } = await import('../components/messagepad');
    const { default: MessagePadReducer } = await import('../components/messagepad/reducers');
    const {
      React, render, Provider, store,
    } = await loadReactRedux(MessagePadReducer);

    reduxStore = store;

    const sock = new SockJs('/home/messages-conn');
    sock.onmessage = (message) => {
      const msg = JSON.parse(message.data);
      store.dispatch({
        type: 'DIALOGUES_MESSAGE_PUSH',
        payload: msg,
      });
    };

    const userSelector = UserSelectAutoComplete.getOrConstruct($('.dialog__body--user-select [name="user"]'));
    const userSelectDialog = new ActionDialog({
      $body: $('.dialog__body--user-select > div'),
      onDispatch(action) {
        if (action === 'ok' && userSelector.value() === null) {
          userSelector.focus();
          return false;
        }
        return true;
      },
    });
    userSelectDialog.clear = function () {
      userSelector.clear();
      return this;
    };

    render(
      <Provider store={store}>
        <MessagePadApp
          onAdd={async () => {
            const action = await userSelectDialog.clear().open();
            if (action !== 'ok') {
              return;
            }
            const user = userSelector.value();
            createDialog(user);
          }}
        />
      </Provider>,
      $('#messagePad').get(0),
    );
  }

  /**
   * A target user id may be assigned in the query string.
   */
  async function loadSendTarget() {
    const queryString = parseQueryString();
    if (!queryString.target_uid) {
      return;
    }
    const user = await request.get('/user/search', {
      q: queryString.target_uid,
      exact_match: true,
    });
    if (!user || user.length === 0) {
      return;
    }
    createDialog(user[0]);
  }

  async function init() {
    await mountComponent();
    await loadSendTarget();
  }

  init();
});

export default page;
