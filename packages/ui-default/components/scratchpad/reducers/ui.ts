import Notification from 'vj/components/notification';
import i18n from 'vj/utils/i18n';

export default function reducer(state = {
  main: {
    size: '50%',
    savedSize: '50%',
  },
  pretest: {
    visible: ['default', 'fileio'].includes(UiContext.pdoc.config?.type)
      ? localStorage.getItem('scratchpad/pretest') === 'true'
      : false,
    size: 200,
  },
  records: {
    visible: UiContext.canViewRecord && localStorage.getItem('scratchpad/records') === 'true',
    size: 100,
    isLoading: false,
  },
  isPosting: false,
  pretestWaitSec: 0,
  submitWaitSec: 0,
  lastTick: 0,
  activePage: 'problem',
}, action: any = {}) {
  switch (action.type) {
    case 'SCRATCHPAD_UI_CHANGE_SIZE': {
      const { uiElement, size } = action.payload;
      return {
        ...state,
        [uiElement]: {
          ...state[uiElement],
          size,
        },
      };
    }
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
      let { size } = state.main;
      if (newPage === state.activePage) {
        newPage = null;
        (size as any) = 0;
      } else if (state.activePage === null) {
        size = state.main.savedSize;
      }
      return {
        ...state,
        main: {
          ...state.main,
          size,
          savedSize: state.main.size,
        },
        activePage: newPage,
      };
    }
    default:
      return state;
  }
}
