import $ from 'jquery';
import React from 'react';
import { createRoot } from 'react-dom/client';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { ActionDialog } from 'vj/components/dialog';
import VjNotification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import api, { gql } from 'vj/utils/api';
import loadReactRedux from 'vj/utils/loadReactRedux';

const page = new NamedPage('home_messages', () => {
  let reduxStore;

  function createDialog(user) {
    reduxStore.dispatch({
      type: 'DIALOGUES_CREATE',
      payload: {
        user,
      },
    });
    reduxStore.dispatch({
      type: 'DIALOGUES_SWITCH_TO',
      payload: user._id,
    });
  }

  async function mountComponent() {
    const { default: WebSocket } = await import('../components/socket');
    const { default: MessagePadApp } = await import('../components/messagepad');
    const { default: MessagePadReducer } = await import('../components/messagepad/reducers');
    const { Provider, store } = await loadReactRedux(MessagePadReducer);

    reduxStore = store;

    const sock = new WebSocket('/home/messages-conn');
    sock.onmessage = (message) => {
      const msg = JSON.parse(message.data);
      store.dispatch({
        type: 'DIALOGUES_MESSAGE_PUSH',
        payload: msg,
      });
      const notification = new VjNotification({
        title: msg.udoc.uname,
        avatar: msg.udoc.avatarUrl,
        message: msg.mdoc.content,
        duration: 15000,
        action: () => {
          store.dispatch({
            type: 'DIALOGUES_SWITCH_TO',
            payload: msg.udoc._id,
          });
          notification.hide();
        },
      });
      notification.show();
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

    createRoot($('#messagePad').get(0)).render(
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
    );
  }

  /**
   * A target user id may be assigned in the query string.
   */
  async function loadSendTarget() {
    const target = new URL(window.location.href).searchParams.get('target');
    if (!target) return;
    const user = await api(gql`
      users(search: ${target}, exact: true) {
        _id
        uname
        avatarUrl
        mail
      }
    `, ['data', 'users']);
    if (!user?.length) return;
    createDialog(user[0]);
  }

  async function init() {
    await mountComponent();
    await loadSendTarget();
  }

  init();
});

export default page;
