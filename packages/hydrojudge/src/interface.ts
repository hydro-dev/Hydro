import { CopyInFile } from './sandbox';

export interface Execute {
    execute: string;
    clean: () => Promise<any>;
    copyIn: Record<string, CopyInFile>;
    time?: number;
}

export interface CheckConfig {
    execute: string;
    input: CopyInFile;
    output: CopyInFile;
    user_stdout: CopyInFile;
    user_stderr: CopyInFile;
    copyIn: Record<string, CopyInFile>;
    score: number;
    detail: boolean;
    env?: Record<string, string>;
}
