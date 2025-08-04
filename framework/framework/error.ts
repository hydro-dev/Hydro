interface IHydroError {
    new(...args: any[]): HydroError;
}

export class HydroError extends Error {
    params: any[];
    code: number;

    constructor(...params: any[]) {
        super();
        this.params = params;
    }

    msg() {
        return 'HydroError';
    }

    get message() {
        return this.msg();
    }
}

const Err = (name: string, Class: IHydroError, ...info: Array<(() => string) | string | number>) => {
    let msg: () => string;
    let code: number;
    for (const item of info) {
        if (typeof item === 'number') {
            code = item;
        } else if (typeof item === 'string') {
            msg = function () { return item; };
        } else if (typeof item === 'function') {
            msg = item;
        }
    }
    // eslint-disable-next-line ts/no-shadow
    return class HydroError extends Class {
        name = name;
        constructor(...args: any[]) {
            super(...args);
            if (msg) this.msg = msg;
            if (code) this.code = code;
        }
    };
};

export const UserFacingError = Err('UserFacingError', HydroError, 'UserFacingError', 400);
export const SystemError = Err('SystemError', HydroError, 'SystemError', 500);

export const BadRequestError = Err('BadRequestError', UserFacingError, 'BadRequestError', 400);
export const ForbiddenError = Err('ForbiddenError', UserFacingError, 'ForbiddenError', 403);
export const NotFoundError = Err('NotFoundError', UserFacingError, 'NotFoundError', 404);
export const MethodNotAllowedError = Err('MethodNotAllowedError', UserFacingError, 'MethodNotAllowedError', 405);

export const ValidationError = Err('ValidationError', ForbiddenError, function (this: HydroError) {
    if (this.params.length === 3) {
        return this.params[1]
            ? 'Field {0} or {1} validation failed. ({2})'
            : 'Field {0} validation failed. ({2})';
    }
    return this.params[1]
        ? 'Field {0} or {1} validation failed.'
        : 'Field {0} validation failed.';
});
export const CsrfTokenError = Err('CsrfTokenError', ForbiddenError, 'CsrfTokenError');
export const InvalidOperationError = Err('InvalidOperationError', MethodNotAllowedError);
export const FileTooLargeError = Err('FileTooLargeError', ValidationError, 'The uploaded file is too long.');

export const CreateError = Err;
