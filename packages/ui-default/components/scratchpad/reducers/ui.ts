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
  waitSec: 0,
  isWaiting: false,
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
      if (action.type === 'SCRATCHPAD_POST_SUBMIT_FULFILLED' && UiContext.canViewRecord) {
        state.records.visible = true;
      }
      return {
        ...state,
        isPosting: false,
        waitSec: 5,
        isWaiting: true,
      };
    }
    case 'SCRATCHPAD_POST_PRETEST_REJECTED':
    case 'SCRATCHPAD_POST_SUBMIT_REJECTED': {
      Notification.error(action.payload.message);
      return {
        ...state,
        isPosting: false,
        waitSec: 5,
        isWaiting: true,
      };
    }
    case 'SCRATCHPAD_WAITING_TICK': {
      return {
        ...state,
        waitSec: state.waitSec - 1,
        isWaiting: state.waitSec > 1,
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
