import { NamedPage } from 'vj/misc/Page';
import api, { e } from 'vj/utils/api';
import loadReactRedux from 'vj/utils/loadReactRedux';
import parseQueryString from 'vj/utils/parseQueryString';

import { ActionDialog } from 'vj/components/dialog';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';

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
    const { default: SockJs } = await import('../components/socket');
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
    if (!queryString.target) return;
    const user = await api(e`
      users(search: ${queryString.target}, exact: true) {
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
