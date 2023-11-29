/* eslint-disable no-await-in-loop */
import {
    Logger, parseMemoryMB, parseTimeMS, sleep, STATUS,
} from 'hydrooj';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';

const logger = new Logger('remote/yacs');

export default class YACSProvider extends BasicFetcher implements IBasicProvider {
    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        super(account, 'https://iai.sh.cn', 'form', logger);
    }

    get loggedIn() {
        return false;
    }

    async ensureLogin() {
        return false;
    }

    async getProblem(id: string) {
        logger.info(id);
        return {
            title: '',
            data: {
                'config.yaml': Buffer.from(`time: 1s\nmemory: 256m\ntype: remote_judge\nsubType: yacs\ntarget: ${id}`),
            },
            files: {},
            tag: [],
            content: '',
        };
    }

    async listProblem(page: number, resync = false) {
        if (resync && page > 1) return [];
        return [];
    }

    async submitProblem(id: string, lang: string, code: string) {
        return '';
    }

    async waitForSubmission(id: string, next, end) {
    }
}