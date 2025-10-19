// Please note that accepted < others, rp system uses this feature.
import { STATUS } from '@hydrooj/common';
export { STATUS, STATUS_TEXTS } from '@hydrooj/common';

export const STATUS_CODES = {
  [STATUS.STATUS_WAITING]: 'pending',
  [STATUS.STATUS_ACCEPTED]: 'pass',
  [STATUS.STATUS_WRONG_ANSWER]: 'fail',
  [STATUS.STATUS_TIME_LIMIT_EXCEEDED]: 'fail',
  [STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: 'fail',
  [STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED]: 'fail',
  [STATUS.STATUS_RUNTIME_ERROR]: 'fail',
  [STATUS.STATUS_COMPILE_ERROR]: 'fail',
  [STATUS.STATUS_SYSTEM_ERROR]: 'fail',
  [STATUS.STATUS_CANCELED]: 'ignored',
  [STATUS.STATUS_ETC]: 'fail',
  [STATUS.STATUS_JUDGING]: 'progress',
  [STATUS.STATUS_COMPILING]: 'progress',
  [STATUS.STATTUS_FETCHED]: 'progress',
  [STATUS.STATUS_IGNORED]: 'ignored',
};

/**
 * Whether to show detail about each test case for a submission status
 */
export const STATUS_SCRATCHPAD_SHOW_DETAIL_FLAGS = {
  [STATUS.STATUS_WAITING]: false,
  [STATUS.STATUS_ACCEPTED]: true,
  [STATUS.STATUS_WRONG_ANSWER]: true,
  [STATUS.STATUS_TIME_LIMIT_EXCEEDED]: true,
  [STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: true,
  [STATUS.STATUS_RUNTIME_ERROR]: true,
  [STATUS.STATUS_COMPILE_ERROR]: false,
  [STATUS.STATUS_SYSTEM_ERROR]: false,
  [STATUS.STATUS_CANCELED]: false,
  [STATUS.STATUS_ETC]: false,
  [STATUS.STATUS_JUDGING]: false,
  [STATUS.STATUS_COMPILING]: false,
  [STATUS.STATUS_FETCHED]: false,
  [STATUS.STATUS_IGNORED]: false,
};

/**
 * Short text to show in Scratchpad mode
 */
export const STATUS_SCRATCHPAD_SHORT_TEXTS = {
  [STATUS.STATUS_ACCEPTED]: 'AC',
  [STATUS.STATUS_WRONG_ANSWER]: 'WA',
  [STATUS.STATUS_TIME_LIMIT_EXCEEDED]: 'TLE',
  [STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: 'MLE',
  [STATUS.STATUS_RUNTIME_ERROR]: 'RTE',
};
