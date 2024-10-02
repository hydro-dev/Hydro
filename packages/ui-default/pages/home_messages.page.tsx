import $ from 'jquery';
import React from 'react';
import { createRoot } from 'react-dom/client';
import VjNotification from 'vj/components/notification';
import selectUser from 'vj/components/selectUser';
import { ctx, Service } from 'vj/context';
import { NamedPage } from 'vj/misc/Page';
import { api, gql, loadReactRedux } from 'vj/utils';

class MessagePadService extends Service {
  constructor(public store, public WebSocket: typeof import('../components/socket').default) {
    super(ctx, 'messagepad', true);
  }
}

declare module '../context' {
  interface Context {
    messagepad: MessagePadService;
  }
}

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
    (window as any).store = reduxStore;
    ctx.set('messagepad', new MessagePadService(store, WebSocket));

    const sock = new WebSocket(`${UiContext.ws_prefix}home/messages-conn`);
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

    createRoot($('#messagePad').get(0)).render(
      <Provider store={store}>
        <MessagePadApp
          onAdd={async () => {
            const user = await selectUser();
            if (user) createDialog(user);
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
