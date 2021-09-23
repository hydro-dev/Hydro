import { STATUS_TEXTS } from '@hydrooj/utils/lib/status';
import { CompileErrorInfo } from './interface';

export class CompileError extends Error {
    stdout: string;
    stderr: string;
    status: string;
    type: string;

    constructor(obj: string | CompileErrorInfo) {
        super('Compile Error');
        if (typeof obj === 'string') {
            this.stdout = obj;
            this.stderr = '';
        } else {
            this.stdout = obj.stdout || '';
            this.stderr = obj.stderr || '';
            this.status = obj.status ? STATUS_TEXTS[obj.status] || '' : '';
        }
        this.type = 'CompileError';
    }
}

export class FormatError extends Error {
    type: string;
    params: any[];

    constructor(message: string, params = []) {
        super(message);
        this.type = 'FormatError';
        this.params = params;
    }
}

export class RuntimeError extends Error {
    type: string;
    detail: any;

    constructor(detail: string, message: string) {
        super(message);
        this.type = 'RuntimeError';
        this.detail = detail;
    }
}

export class SystemError extends Error {
    type: string;
    params: any[];

    constructor(message: string, params = []) {
        super(message);
        this.type = 'SystemError';
        this.params = params;
    }
}

export class TooFrequentError extends Error {
    type: string;

    constructor(message: string) {
        super(message);
        this.type = 'TooFrequentError';
    }
}
