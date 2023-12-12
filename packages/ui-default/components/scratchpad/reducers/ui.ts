import Notification from 'vj/components/notification';
import { i18n } from 'vj/utils';

export default function reducer(state = {
  pretest: {
    visible: UiContext.pdoc.config?.type === 'default'
      ? localStorage.getItem('scratchpad/pretest') === 'true'
      : false,
  },
  records: {
    visible: UiContext.canViewRecord && localStorage.getItem('scratchpad/records') === 'true',
    isLoading: false,
  },
  settings: {
    visible: false,
    config: JSON.parse(localStorage.getItem('editor.config') || '{}'),
  },
  isPosting: false,
  pretestWaitSec: 0,
  submitWaitSec: 0,
  lastTick: 0,
  activePage: 'problem',
  pendingCommand: '',
}, action: any = {}) {
  switch (action.type) {
    case 'SCRATCHPAD_UI_SET_VISIBILITY': {
      const { uiElement, visibility } = action.payload;
      localStorage.setItem(`scratchpad/${uiElement}`, visibility.toString());
      return {
        ...state,
        [uiElement]: {
          ...state[uiElement],
          visible: visibility,
        },
      };
    }
    case 'SCRATCHPAD_UI_TOGGLE_VISIBILITY': {
      const { uiElement } = action.payload;
      localStorage.setItem(`scratchpad/${uiElement}`, (!state[uiElement].visible).toString());
      return {
        ...state,
        [uiElement]: {
          ...state[uiElement],
          visible: !state[uiElement].visible,
        },
      };
    }
    case 'SCRATCHPAD_SETTING_UPDATE': {
      const { setting, value } = action.payload;
      const config = {
        ...state.settings.config,
        [setting]: value,
      };
      localStorage.setItem('editor.config', JSON.stringify(config));
      return {
        ...state,
        settings: {
          ...state.settings,
          config,
        },
      };
    }
    case 'SCRATCHPAD_TRIGGER_EDITOR_COMMAND': {
      return {
        ...state,
        pendingCommand: action.payload.command,
      };
    }
    case 'SCRATCHPAD_POST_PRETEST_PENDING':
    case 'SCRATCHPAD_POST_SUBMIT_PENDING': {
      return {
        ...state,
        isPosting: true,
      };
    }
    case 'SCRATCHPAD_POST_PRETEST_FULFILLED':
    case 'SCRATCHPAD_POST_SUBMIT_FULFILLED': {
      Notification.success(i18n('Submitted.'));
      return (action.type === 'SCRATCHPAD_POST_SUBMIT_FULFILLED' && UiContext.canViewRecord)
        ? {
          ...state,
          records: {
            ...state.records,
            visible: true,
          },
          isPosting: false,
          submitWaitSec: 8,
        } : {
          ...state,
          isPosting: false,
          pretestWaitSec: 5,
        };
    }
    case 'SCRATCHPAD_POST_PRETEST_REJECTED':
    case 'SCRATCHPAD_POST_SUBMIT_REJECTED': {
      Notification.error(action.payload.message);
      return {
        ...state,
        isPosting: false,
        pretestWaitSec: 3,
        submitWaitSec: 3,
      };
    }
    case 'SCRATCHPAD_WAITING_TICK': {
      if (Date.now() - state.lastTick < 950) return state;
      return {
        ...state,
        lastTick: Date.now(),
        pretestWaitSec: Math.max(state.pretestWaitSec - 1, 0),
        submitWaitSec: Math.max(state.submitWaitSec - 1, 0),
      };
    }
    case 'SCRATCHPAD_RECORDS_LOAD_SUBMISSIONS_PENDING': {
      return {
        ...state,
        records: {
          ...state.records,
          isLoading: true,
        },
      };
    }
    case 'SCRATCHPAD_RECORDS_LOAD_SUBMISSIONS_REJECTED': {
      Notification.error(action.payload.message);
      return {
        ...state,
        records: {
          ...state.records,
          isLoading: false,
        },
      };
    }
    case 'SCRATCHPAD_RECORDS_LOAD_SUBMISSIONS_FULFILLED': {
      return {
        ...state,
        records: {
          ...state.records,
          isLoading: false,
        },
      };
    }
    case 'SCRATCHPAD_SWITCH_TO_PAGE': {
      let newPage = action.payload;
      if (newPage === state.activePage) newPage = null;
      return {
        ...state,
        activePage: newPage,
      };
    }
    default:
      return state;
  }
}
