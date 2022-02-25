import { CopyInFile } from './sandbox/interface';

export interface Execute {
    execute: string,
    clean: Function,
    copyIn: Record<string, CopyInFile>,
    time?: number,
}

export interface CompileErrorInfo {
    stdout?: string,
    stderr?: string,
    status?: number
}

export interface CheckConfig {
    execute: string;
    checker_type: string;
    input: CopyInFile;
    output: CopyInFile;
    user_stdout: CopyInFile;
    user_stderr: CopyInFile;
    copyIn: Record<string, CopyInFile>;
    score: number;
    detail: boolean;
    env?: Record<string, string>;
}

export interface CheckResult {
    status: number,
    score: number,
    message: string,
    code?: number,
}
