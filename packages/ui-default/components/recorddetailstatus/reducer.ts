import {
  JudgeMessage, SubtaskResult, TestCase,
} from 'hydrooj';

interface State {
  status: number;
  score: number;
  progress: number;
  compilerTexts: string[];
  judgeTexts: (string | JudgeMessage)[];
  testCases: TestCase[];
  subtasks: Record<number, SubtaskResult>;
}

export default function reducer(state = { __loaded: false, rdoc: null }, action: any = {}): {
  __loaded: boolean, rdoc: State | null
} {
  switch (action.type) {
    case 'RDOC_LOAD_FULFILLED': {
      return { __loaded: true, rdoc: action.payload.rdoc };
    }
    case 'RDOC_UPDATE': {
      const {
        status, score, progress, compilerTexts, judgeTexts, testCases, subtasks,
      } = action.payload;
      return {
        __loaded: true,
        rdoc: {
          ...state.rdoc || {},
          status,
          score,
          progress,
          compilerTexts,
          judgeTexts,
          testCases,
          subtasks,
        },
      };
    }
    default:
      return state;
  }
}

export type RootState = ReturnType<typeof reducer>;
