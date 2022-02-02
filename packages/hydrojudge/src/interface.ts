import { CopyInFile } from './sandbox_interface';

export type SFile = CopyInFile;

export interface Execute {
    execute: string,
    clean: Function,
    copyIn: Record<string, SFile>,
    time?: number,
}
export interface CompileErrorInfo {
    stdout?: string,
    stderr?: string,
    status?: string
}
