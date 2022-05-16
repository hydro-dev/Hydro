import { STATUS_TEXTS } from '@hydrooj/utils/lib/status';
import { CompileErrorInfo } from './interface';

export class CompileError extends Error {
    stdout: string;
    stderr: string;
    status: string;
    type = 'CompileError';

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
    }
}

export class FormatError extends Error {
    type = 'FormatError';

    constructor(message: string, public params = []) {
        super(message);
    }
}

export class RuntimeError extends Error {
    type = 'RuntimeError';

    constructor(public detail: string, message: string) {
        super(message);
    }
}

export class SystemError extends Error {
    type = 'SystemError';

    constructor(message: string, public params = []) {
        super(message);
    }
}
