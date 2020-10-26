export const STATUS_WAITING = 0;
export const STATUS_ACCEPTED = 1;
export const STATUS_WRONG_ANSWER = 2;
export const STATUS_TIME_LIMIT_EXCEEDED = 3;
export const STATUS_MEMORY_LIMIT_EXCEEDED = 4;
export const STATUS_OUTPUT_LIMIT_EXCEEDED = 5;
export const STATUS_RUNTIME_ERROR = 6;
export const STATUS_COMPILE_ERROR = 7;
export const STATUS_SYSTEM_ERROR = 8;
export const STATUS_CANCELED = 9;
export const STATUS_ETC = 10;
export const STATUS_JUDGING = 20;
export const STATUS_COMPILING = 21;
export const STATUS_FETCHED = 22;
export const STATUS_IGNORED = 30;

export const STATUS_TEXTS = {
    [STATUS_WAITING]: 'Waiting',
    [STATUS_ACCEPTED]: 'Accepted',
    [STATUS_WRONG_ANSWER]: 'Wrong Answer',
    [STATUS_TIME_LIMIT_EXCEEDED]: 'Time Exceeded',
    [STATUS_MEMORY_LIMIT_EXCEEDED]: 'Memory Exceeded',
    [STATUS_OUTPUT_LIMIT_EXCEEDED]: 'Output Exceeded',
    [STATUS_RUNTIME_ERROR]: 'Runtime Error',
    [STATUS_COMPILE_ERROR]: 'Compile Error',
    [STATUS_SYSTEM_ERROR]: 'System Error',
    [STATUS_CANCELED]: 'Cancelled',
    [STATUS_ETC]: 'Unknown Error',
    [STATUS_JUDGING]: 'Running',
    [STATUS_COMPILING]: 'Compiling',
    [STATUS_FETCHED]: 'Fetched',
    [STATUS_IGNORED]: 'Ignored',
};
