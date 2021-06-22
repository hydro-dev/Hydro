export interface RemoteAccount {
    _id: string;
    type: string;
    cookie?: string[];
    handle: string;
    password: string;
}
declare module 'hydrooj/dist/interface' {
    interface Collections {
        vjudge: RemoteAccount;
    }

    interface DomainDoc {
        mount: string;
        mountInfo: any;
    }
}
export interface IBasicProvider {
    ensureLogin(): Promise<boolean>;
    getProblem(id: string): Promise<{
        title: string;
        data: Record<string, any>;
        files: Record<string, any>;
        tag: string[];
        content: string;
    }>;
    listProblem(page: number): Promise<string[]>;
    submitProblem(id: string, lang: string, code: string, info): Promise<string>;
    waitForSubmission(id: string, next: any, end: any): Promise<void>;
}

export interface BasicProvider {
    new(account: RemoteAccount, save: (data: any) => Promise<void>): IBasicProvider
}
