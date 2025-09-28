import { DOMWindow, JSDOM } from 'jsdom';
import proxy from 'superagent-proxy';
import { Logger } from '@hydrooj/utils';
import { superagent } from 'hydrooj';
import { RemoteAccount } from './interface';

proxy(superagent);

interface FetchOptions {
    headers?: { [key: string]: string };
    post?: Omit<FetchOptions, 'get' | 'post'>;
    get?: Omit<FetchOptions, 'get' | 'post'>;
}

const defaultUA = `Hydro/${global.Hydro.version.hydrooj} VJudge/${global.Hydro.version.vjudge}`;

export class BasicFetcher {
    cookie: string[] = [];
    UA: string = defaultUA;

    constructor(
        public account: RemoteAccount, private defaultEndpoint: string,
        private formType: 'form' | 'json', public logger: Logger,
        public fetchOptions: FetchOptions = {},
    ) {
        if (account.cookie) this.cookie = account.cookie;
        if (account.UA) this.UA = account.UA;
    }

    get(url: string) {
        this.logger.debug('get', url);
        url = new URL(url, this.endpoint).toString();
        let req = superagent.get(url).set('Cookie', this.cookie).set('User-Agent', this.UA);
        if (this.fetchOptions.headers) req = req.set(this.fetchOptions.headers);
        if (this.fetchOptions.get?.headers) req = req.set(this.fetchOptions.get.headers);
        return this.account.proxy ? req.proxy(this.account.proxy) : req;
    }

    async html(url: string) {
        const { text: html, headers } = await this.get(url);
        const $dom = new JSDOM(html);
        $dom.window.html = html;
        $dom.window.headers = headers;
        return $dom.window as DOMWindow & { html: string, headers: any };
    }

    post(url: string, type = this.formType) {
        this.logger.debug('post', url, this.cookie);
        url = new URL(url, this.endpoint).toString();
        let req = superagent.post(url).set('Cookie', this.cookie).set('User-Agent', this.UA).type(type);
        if (this.fetchOptions.headers) req = req.set(this.fetchOptions.headers);
        if (this.fetchOptions.post?.headers) req = req.set(this.fetchOptions.post.headers);
        return this.account.proxy ? req.proxy(this.account.proxy) : req;
    }

    setCookie(cookie: string | string[], save = false) {
        if (typeof cookie === 'string') this.cookie = [cookie];
        else this.cookie = cookie;
        if (save && 'save' in this && typeof this.save === 'function') return this.save({ cookie: this.cookie });
        return null;
    }

    get endpoint() {
        return this.account.endpoint || this.defaultEndpoint;
    }

    set endpoint(endpoint: string) {
        this.defaultEndpoint = endpoint;
    }
}
