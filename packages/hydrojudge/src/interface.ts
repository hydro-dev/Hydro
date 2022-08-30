import { CopyInFile } from './sandbox';

export interface Execute {
    execute: string;
    clean: () => Promise<any>;
    copyIn: Record<string, CopyInFile>;
    time?: number;
}
