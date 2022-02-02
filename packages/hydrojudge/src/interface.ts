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
    status?: string
}
