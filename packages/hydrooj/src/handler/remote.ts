/* eslint-disable no-await-in-loop */
import superagent from 'superagent';
import { PassThrough } from 'stream';
import { argv } from 'yargs';
import { PermissionError, InvalidTokenError, RemoteOnlineJudgeError } from '../error';
import { Logger } from '../logger';
import { logAndReturn } from '../utils';
import { ProblemAdd } from '../lib/ui';
import { PERM, PRIV } from '../model/builtin';
import token from '../model/token';
import problem from '../model/problem';
import * as system from '../model/system';
import storage from '../model/storage';
import {
    Handler, Types, Route, post,
} from '../service/server';

const logger = new Logger('remote');

export class ProblemSendHandler extends Handler {
    async get() {
        this.checkPerm(PERM.PERM_VIEW_PROBLEM);
        this.response.template = 'problem_send.html';
    }

    @post('target', Types.String)
    @post('pids', Types.Array)
    async postSend(domainId: string, _target: string, _pids: (number | string)[]) {
        this.checkPerm(PERM.PERM_VIEW_PROBLEM);
        const target = _target.split('@');
        if (target[1].endsWith('/')) target[1] = target[1].substr(0, target[1].length - 1);
        const getHidden = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        const getData = this.user.hasPriv(PRIV.PRIV_READ_PROBLEM_DATA) || this.user.hasPerm(PERM.PERM_READ_PROBLEM_DATA);
        const pdocs = await problem.getList(domainId, _pids, true, true, ['docId', 'owner', 'hidden']);
        const pids = new Set<number>();
        for (const key in pdocs) {
            pids.add(pdocs[key].docId);
            if (pdocs[key].hidden && !getHidden && !this.user.own(pdocs[key])) {
                throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
            }
            if (!getData && !this.user.own(pdocs[key]) && !this.user.hasPriv(PRIV.PRIV_READ_PROBLEM_DATA)) {
                throw new PermissionError(PERM.PERM_READ_PROBLEM_DATA);
            }
        }
        const [url, expire] = system.getMany(['server.url', 'session.saved_expire_seconds']);
        const tokenId = await token.createOrUpdate(token.TYPE_EXPORT, expire, { creator: this.user._id, domainId, pids: Array.from(pids) });
        const res = system.get('server.proxy')
            ? await superagent.post(`${system.get('server.center')}/send`)
                .send({
                    endpoint: `${target[1]}/d/${target[0]}`,
                    domainId,
                    url,
                    tokenId,
                    expire,
                }).catch(logAndReturn(logger))
            : await superagent.post(`${target[1]}/d/${target[0]}/problem/receive`)
                .send({
                    operation: 'request', url: `${url}d/${domainId}/problem/send`, tokenId, expire,
                }).catch(logAndReturn(logger));
        if (res instanceof Error) throw new RemoteOnlineJudgeError(`[Post Target/Request] ${res.message}`);
        this.back();
    }

    @post('token', Types.Content)
    async postInfo(domainId: string, tokenId: string) {
        const data = await token.get(tokenId, token.TYPE_EXPORT);
        if (!data) throw new InvalidTokenError(tokenId);
        const r = {};
        const pdocs = await problem.getMulti(domainId, { docId: { $in: data.pids } }, ['title', 'docId']).toArray();
        for (const pdoc of pdocs) r[pdoc.docId] = pdoc.title;
        this.response.body = { pdocs: r, pids: data.pids };
    }

    @post('token', Types.Content, true)
    @post('pids', Types.Array)
    async postFetch(domainId: string, tokenId: string, pids: number[]) {
        pids = pids.map((i) => (+i ? +i : i));
        const pdocs = await problem.getMulti(domainId, { docId: { $in: pids } }, problem.PROJECTION_PUBLIC).toArray();
        const data = await token.get(tokenId, token.TYPE_EXPORT);
        if (!data) throw new InvalidTokenError(tokenId);
        if (pids.filter((pid) => !data.pids.includes(pid)).length) throw new InvalidTokenError(tokenId);
        const links = [];
        for (const pdoc of pdocs) {
            const files = await storage.list(`problem/${domainId}/${pdoc.docId}/`, true);
            const l = [];
            for (const file of files) {
                l.push([
                    file.name,
                    await storage.signDownloadLink(file.prefix + file.name, file.name, false, 'user'),
                ]);
            }
            links.push(l);
        }
        this.response.body = { pdocs, links };
    }
}

export class ProblemReceiveHandler extends Handler {
    noCheckPermView = true;

    async get({ domainId }) {
        this.checkPerm(PERM.PERM_CREATE_PROBLEM);
        let requests = await token.getMulti(token.TYPE_IMPORT, { domainId }).toArray();
        requests = requests.map((request) => {
            const url = new URL(request.source);
            request.display = `${url.host}/${url.pathname.split('/')[2]}/`;
            request.url = `${url.origin}/d/${url.pathname.split('/')[2]}/p/`;
            return request;
        });
        this.response.template = 'problem_receive.html';
        this.response.body = { requests };
        this.response.body.path = [
            ['Hydro', 'homepage'],
            ['problem_main', 'problem_main'],
            ['problem_receive', null],
        ];
    }

    @post('url', Types.String)
    @post('tokenId', Types.String)
    @post('expire', Types.UnsignedInt)
    async postRequest(domainId: string, url: string, tokenId: string, expire: number) {
        const res = await superagent.post(url)
            .send({ operation: 'info', token: tokenId })
            .catch(logAndReturn(logger));
        if (res instanceof Error) throw new RemoteOnlineJudgeError(`[Post Origin/Info] ${res.message}`);
        const [id] = await token.add(token.TYPE_IMPORT, expire, {
            domainId, tokenId, source: url, pdocs: res.body.pdocs, pids: res.body.pids,
        });
        this.response.body = { token: id };
    }

    // eslint-disable-next-line class-methods-use-this
    async syncFiles(domainId: string, baseUrl: string, pid: number, files: [string, string][]) {
        for (const file of files) {
            const content = new PassThrough();
            superagent.get(file[1].startsWith('/') ? baseUrl + file[1] : file[1]).pipe(content);
            if (file[0].startsWith('testdata/')) {
                await problem.addTestdata(domainId, pid, file[0].split('testdata/')[1], content);
            } else if (file[0].startsWith('additional_file/')) {
                await problem.addAdditionalFile(domainId, pid, file[0].split('additional_file/')[1], content);
            }
        }
    }

    @post('tokenId', Types.String)
    @post('pids', Types.Array, true)
    async postConfirm(domainId: string, tokenId: string, filterPid?: number[]) {
        this.checkPerm(PERM.PERM_CREATE_PROBLEM);
        const data = await token.get(tokenId, token.TYPE_IMPORT);
        if (!data) throw new InvalidTokenError(tokenId);
        const res = await superagent.post(data.source).send({
            operation: 'fetch',
            token: data.tokenId,
            pids: filterPid.length ? filterPid.map((i) => (+i ? +i : i)) : data.pids,
        }).catch(logAndReturn(logger));
        if (res instanceof Error) throw new RemoteOnlineJudgeError(`[Post Origin/Fetch] ${res.message}`);
        const pids = [];
        const { pdocs } = res.body;
        const files = res.body.links;
        const source = new URL(data.source);
        const baseUrl = `${source.protocol}//${source.host}`;
        const exportToken = await token.get(data.tokenId, token.TYPE_EXPORT);
        for (let i = 0; i < pdocs.length; i++) {
            const pdoc = pdocs[i];
            if (pdoc.pid) {
                const exist = await problem.get(domainId, pdoc.pid);
                if (exist) pdoc.pid = undefined;
            }
            const pid = await problem.add(domainId, pdoc.pid, pdoc.title, pdoc.content, exportToken?.creator || this.user._id, pdoc.tag);
            pids.push(pid);
            this.syncFiles(
                domainId,
                exportToken ? baseUrl : `http://127.0.0.1:${argv.port || system.get('server.port')}`,
                pid, files[i],
            ).catch(logAndReturn(logger));
            await problem.edit(domainId, pid, { html: pdoc.html });
        }
        this.back();
        this.response.body = { pids };
    }
}

export async function apply() {
    ProblemAdd('problem_receive', {}, 'copy', 'Import From Hydro');
    Route('problem_receive', '/problem/receive', ProblemReceiveHandler);
    Route('problem_send', '/problem/send', ProblemSendHandler);
}

global.Hydro.handler.remote = apply;
