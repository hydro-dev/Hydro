import { JudgeResultBody, LangConfig } from '@hydrooj/common';

export interface RemoteAccount {
    _id: string;
    type: string;
    cookie?: string[];
    handle: string;
    password: string;
    endpoint?: string;
    proxy?: string;
    query?: string;
    frozen?: string;
    problemLists?: string[];
    enableOn?: string[];
    UA?: string;
}
export interface VjudgeMount {
    _id: string; //  domainId, or `${domainId}.${namespace}`
    mount: string;
    syncDone: Record<string, number>;
}
declare module 'hydrooj' {
    interface Collections {
        vjudge: RemoteAccount;
        'vjudge.mount': VjudgeMount;
    }
}
type NextFunction = (body: Partial<JudgeResultBody>) => void;
export interface IBasicProvider {
    ensureLogin: () => Promise<boolean | string>;
    getProblem: (id: string, meta: Record<string, any>) => Promise<{
        title: string;
        data: Record<string, any>;
        files: Record<string, any>;
        tag: string[];
        content: string;
        difficulty?: number;
        solution?: string;
    }>;
    entryProblemLists?: string[];
    listProblem: (page: number, resyncFrom: number, listId: string) => Promise<string[]>;
    submitProblem: (id: string, lang: string, code: string, info: any, next: NextFunction, end: NextFunction) => Promise<string | void>;
    waitForSubmission: (id: string, next: NextFunction, end: NextFunction) => Promise<void>;
    checkStatus?: (onCheckFunc: boolean) => Promise<void>;
    stop?: () => Promise<void>;
}

export interface BasicProvider {
    new(account: RemoteAccount, save: (data: any) => Promise<void>): IBasicProvider;
    Langs?: Record<string, Partial<LangConfig>>;
    noComment?: boolean;
}
