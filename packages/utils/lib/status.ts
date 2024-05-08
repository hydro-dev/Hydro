export enum STATUS {
    STATUS_WAITING = 0,
    STATUS_ACCEPTED = 1,
    STATUS_WRONG_ANSWER = 2,
    STATUS_TIME_LIMIT_EXCEEDED = 3,
    STATUS_MEMORY_LIMIT_EXCEEDED = 4,
    STATUS_OUTPUT_LIMIT_EXCEEDED = 5,
    STATUS_RUNTIME_ERROR = 6,
    STATUS_COMPILE_ERROR = 7,
    STATUS_SYSTEM_ERROR = 8,
    STATUS_CANCELED = 9,
    STATUS_ETC = 10,
    STATUS_HACKED = 11,
    STATUS_JUDGING = 20,
    STATUS_COMPILING = 21,
    STATUS_FETCHED = 22,
    STATUS_IGNORED = 30,
    STATUS_FORMAT_ERROR = 31,
    STATUS_HACK_SUCCESSFUL = 32,
    STATUS_HACK_UNSUCCESSFUL = 33,
}

export const STATUS_TEXTS: Record<STATUS, string> = {
    [STATUS.STATUS_WAITING]: 'Waiting',
    [STATUS.STATUS_ACCEPTED]: 'Accepted',
    [STATUS.STATUS_WRONG_ANSWER]: 'Wrong Answer',
    [STATUS.STATUS_TIME_LIMIT_EXCEEDED]: 'Time Exceeded',
    [STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: 'Memory Exceeded',
    [STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED]: 'Output Exceeded',
    [STATUS.STATUS_RUNTIME_ERROR]: 'Runtime Error',
    [STATUS.STATUS_COMPILE_ERROR]: 'Compile Error',
    [STATUS.STATUS_SYSTEM_ERROR]: 'System Error',
    [STATUS.STATUS_CANCELED]: 'Cancelled',
    [STATUS.STATUS_ETC]: 'Unknown Error',
    [STATUS.STATUS_HACKED]: 'Hacked',
    [STATUS.STATUS_JUDGING]: 'Running',
    [STATUS.STATUS_COMPILING]: 'Compiling',
    [STATUS.STATUS_FETCHED]: 'Fetched',
    [STATUS.STATUS_IGNORED]: 'Ignored',
    [STATUS.STATUS_FORMAT_ERROR]: 'Format Error',
    [STATUS.STATUS_HACK_SUCCESSFUL]: 'Hack Successful',
    [STATUS.STATUS_HACK_UNSUCCESSFUL]: 'Hack Unsuccessful',
};

export const STATUS_SHORT_TEXTS: Partial<Record<STATUS, string>> = {
    [STATUS.STATUS_ACCEPTED]: 'AC',
    [STATUS.STATUS_WRONG_ANSWER]: 'WA',
    [STATUS.STATUS_TIME_LIMIT_EXCEEDED]: 'TLE',
    [STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: 'MLE',
    [STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED]: 'OLE',
    [STATUS.STATUS_RUNTIME_ERROR]: 'RE',
    [STATUS.STATUS_COMPILE_ERROR]: 'CE',
    [STATUS.STATUS_SYSTEM_ERROR]: 'SE',
    [STATUS.STATUS_CANCELED]: 'IGN',
    [STATUS.STATUS_HACKED]: 'HK',
    [STATUS.STATUS_IGNORED]: 'IGN',
    [STATUS.STATUS_FORMAT_ERROR]: 'FE',
};

export const STATUS_CODES: Record<STATUS, string> = {
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
    [STATUS.STATUS_HACKED]: 'fail',
    [STATUS.STATUS_JUDGING]: 'progress',
    [STATUS.STATUS_COMPILING]: 'progress',
    [STATUS.STATUS_FETCHED]: 'progress',
    [STATUS.STATUS_IGNORED]: 'ignored',
    [STATUS.STATUS_FORMAT_ERROR]: 'ignored',
    [STATUS.STATUS_HACK_SUCCESSFUL]: 'pass',
    [STATUS.STATUS_HACK_UNSUCCESSFUL]: 'fail',
};

export function getScoreColor(score: number | string): string {
    if (score === null || score === undefined || !Number.isFinite(+score)) return '#000000';
    return [
        '#ff4f4f',
        '#ff694f',
        '#f8603a',
        '#fc8354',
        '#fa9231',
        '#f7bb3b',
        '#ecdb44',
        '#e2ec52',
        '#b0d628',
        '#93b127',
        '#25ad40',
    ][Math.floor((Number(score) || 0) / 10)];
}

export const USER_GENDER_MALE = 0;
export const USER_GENDER_FEMALE = 1;
export const USER_GENDER_OTHER = 2;
export const USER_GENDERS = [USER_GENDER_MALE, USER_GENDER_FEMALE, USER_GENDER_OTHER];
export const USER_GENDER_RANGE = {
    [USER_GENDER_MALE]: 'Boy ♂',
    [USER_GENDER_FEMALE]: 'Girl ♀',
    [USER_GENDER_OTHER]: 'Other',
};
export const USER_GENDER_ICONS = {
    [USER_GENDER_MALE]: '♂',
    [USER_GENDER_FEMALE]: '♀',
    [USER_GENDER_OTHER]: '?',
};
