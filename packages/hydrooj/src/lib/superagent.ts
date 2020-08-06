import superagent from 'superagent';
import proxyAgent from 'proxy-agent';

namespace Proxy {
    function getUrl() {
        return this._url;
    }
    function setUrl(v: string) {
        this._url = v;
        // eslint-disable-next-line no-use-before-define
        proxy.call(this, this._proxyUri);
    }
    function setupUrl(req: superagent.Request) {
        const desc = Object.getOwnPropertyDescriptor(req, 'url');
        if (desc.get === getUrl && desc.set === setUrl) return;
        // @ts-ignore
        req._url = req.url;
        desc.get = getUrl;
        desc.set = setUrl;
        delete desc.value;
        delete desc.writable;
        Object.defineProperty(req, 'url', desc);
    }
    function proxy(uri: string) {
        if (!uri) return this;
        setupUrl(this);
        const agent = proxyAgent(uri);
        if (agent) this.agent(agent);
        this._proxyUri = uri;
        return this;
    }
    export function setup(agent, uri = '') {
        const Request = agent.Request;
        if (Request) {
            Request.prototype.proxy = proxy;
            return agent;
        }
        return proxy.call(agent, uri);
    }
}

declare module 'superagent' {
    namespace request {
        interface Request {
            proxy(url: string): this;
        }
    }
}

Proxy.setup(superagent);

export = superagent;
