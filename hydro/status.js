exports.STATUS_WAITING = 0;
exports.STATUS_ACCEPTED = 1;
exports.STATUS_WRONG_ANSWER = 2;
exports.STATUS_TIME_LIMIT_EXCEEDED = 3;
exports.STATUS_MEMORY_LIMIT_EXCEEDED = 4;
exports.STATUS_OUTPUT_LIMIT_EXCEEDED = 5;
exports.STATUS_RUNTIME_ERROR = 6;
exports.STATUS_COMPILE_ERROR = 7;
exports.STATUS_SYSTEM_ERROR = 8;
exports.STATUS_CANCELED = 9;
exports.STATUS_ETC = 10;
exports.STATUS_JUDGING = 20;
exports.STATUS_COMPILING = 21;
exports.STATUS_FETCHED = 22;
exports.STATUS_IGNORED = 30;
exports.STATUS_TEXTS = {
    [exports.STATUS_WAITING]: 'Waiting',
    [exports.STATUS_ACCEPTED]: 'Accepted',
    [exports.STATUS_WRONG_ANSWER]: 'Wrong Answer',
    [exports.STATUS_TIME_LIMIT_EXCEEDED]: 'Time Exceeded',
    [exports.STATUS_MEMORY_LIMIT_EXCEEDED]: 'Memory Exceeded',
    [exports.STATUS_OUTPUT_LIMIT_EXCEEDED]: 'Output Exceeded',
    [exports.STATUS_RUNTIME_ERROR]: 'Runtime Error',
    [exports.STATUS_COMPILE_ERROR]: 'Compile Error',
    [exports.STATUS_SYSTEM_ERROR]: 'System Error',
    [exports.STATUS_CANCELED]: 'Cancelled',
    [exports.STATUS_ETC]: 'Unknown Error',
    [exports.STATUS_JUDGING]: 'Running',
    [exports.STATUS_COMPILING]: 'Compiling',
    [exports.STATUS_FETCHED]: 'Fetched',
    [exports.STATUS_IGNORED]: 'Ignored',
};