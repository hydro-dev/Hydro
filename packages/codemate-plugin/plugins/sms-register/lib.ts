import {
    Err, Logger, PermissionError, SystemError,
} from 'hydrooj';

export const VerifyTokenCheckNotPassedError = Err('VerifyTokenCheckNotPassedError', PermissionError);
export const SendSMSFailedError = Err('SendSMSFailedError', SystemError);
export const VerifyCodeError = Err('VerifyCodeError', PermissionError);
export const UserNotBindPhoneError = Err('UserNotBindPhoneError', PermissionError);

export const logger = new Logger('register-ex');
