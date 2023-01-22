import proxy from 'superagent-proxy';
import { Logger } from '@hydrooj/utils';
import { superagent } from 'hydrooj';
import { RemoteAccount } from './interface';

proxy(superagent);

interface FetchOptions {
    headers?: { [key: string]: string };
    post?: Omit<FetchOptions, 'get' | 'post'>
    get?: Omit<FetchOptions, 'get' | 'post'>
}

export class BasicFetcher {
    cookie: string[] = [];

    constructor(
        public account: RemoteAccount, private defaultEndpoint: string,
        private formType: 'form' | 'json', public logger: Logger,
        private fetchOptions: FetchOptions = {},
    ) {
        if (account.cookie) this.cookie = account.cookie;
    }

    get(url: string) {
        this.logger.debug('get', url);
        if (!url.startsWith('http')) url = new URL(url, this.account.endpoint || this.defaultEndpoint).toString();
        const req = superagent.get(url).set('Cookie', this.cookie);
        if (this.fetchOptions.headers) req.set(this.fetchOptions.headers);
        if (this.fetchOptions.get.headers) req.set(this.fetchOptions.get.headers);
        if (this.account.proxy) return req.proxy(this.account.proxy);
        return req;
    }

    post(url: string) {
        this.logger.debug('post', url, this.cookie);
        if (!url.includes('//')) url = `${this.account.endpoint || this.defaultEndpoint}${url}`;
        const req = superagent.post(url).set('Cookie', this.cookie).type(this.formType);
        if (this.fetchOptions.headers) req.set(this.fetchOptions.headers);
        if (this.fetchOptions.post.headers) req.set(this.fetchOptions.post.headers);
        if (this.account.proxy) return req.proxy(this.account.proxy);
        return req;
    }
}
