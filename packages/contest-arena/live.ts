/* eslint-disable no-await-in-loop -- Publish and stream contest events in dependency order. */
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PassThrough } from 'stream';
import sharp from 'sharp';
import {
    ContestModel, Context, db, DocumentModel, Handler, ObjectId, ProblemModel, RecordModel, SettingModel, SystemModel, UserModel, ValidationError,
} from 'hydrooj';
import type { ArenaBaseHandler } from './index';
import { matchesPassword, PresentationCredentials } from './live-access';
import { buildLiveData, feedHash, publicFeedEvent } from './live-data';
import { InvalidFeedToken, LiveStore } from './live-store';
import { presentationPackage } from './presentation-launcher';
import { accountImage } from './resolver-package';

const access = db.collection<any>('contest.arena.live.access');
let keyring: Promise<string[]>;
async function presentationKeys() {
    keyring ||= (async () => {
        const system = db.collection<any>('system'); const _id = 'arena.presentation.keys';
        try {
            await system.updateOne({ _id }, { $setOnInsert: { value: [randomBytes(32).toString('hex')] } }, { upsert: true });
        } catch (error) { if (error.code !== 11000) throw error; }
        const keys = (await system.findOne({ _id }))?.value;
        if (!Array.isArray(keys) || !keys.length || keys.some((key) => typeof key !== 'string' || key.length < 32)) {
            throw new Error('展示连接的服务器密钥配置无效');
        }
        return keys;
    })().catch((error) => { keyring = null; throw error; });
    return keyring;
}
const credentials = new PresentationCredentials(access, presentationKeys);
const states = db.collection<any>('contest.arena.live.state');
const batches = db.collection<any>('contest.arena.live.batches');
const events = db.collection<any>('contest.arena.live.events');
const store = new LiveStore(states, batches, events);
const accessId = (domainId: string, cid: string) => JSON.stringify([domainId, cid]);
const scopeFor = (domainId: string, c: any) => JSON.stringify([domainId, c.contestId, c.generation]);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fallback = { bytes: readFileSync(join(__dirname, 'frontend/hgnu-logo.png')), extension: 'png', mime: 'image/png' };
const activeStreams = new Map<string, Set<PassThrough>>();
const refreshed = new Map<string, { expires: number, promise: Promise<any> }>();
const portraits = new Map<string, Promise<Buffer>>();

export function basicCredentials(header: string) {
    if (typeof header !== 'string' || header.length > 1024) return null;
    const match = /^Basic ([A-Z0-9+/]+={0,2})$/i.exec(header);
    if (!match) return null;
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const parts = /^(live-([a-f0-9]{24})-([a-f0-9]{12})):([a-f0-9]{64})$/.exec(decoded);
    return parts ? { username: parts[1], contestId: parts[2], generation: parts[3], password: parts[4] } : null;
}
export { matchesPassword };

async function currentContest(domainId: string, c: any) {
    const tdoc = await ContestModel.get(domainId, new ObjectId(c.contestId));
    if (tdoc.rule !== 'icpc_domjudge') throw new Error('该比赛未使用现场赛规则');
    return tdoc;
}
async function refresh(domainId: string, c: any) {
    const scope = scopeFor(domainId, c); const cached = refreshed.get(scope);
    if (cached && cached.expires > Date.now()) return cached.promise;
    const promise = store.publish(scope, async (previousState) => {
        const tdoc = await currentContest(domainId, c);
        const [statuses, records] = await Promise.all([
            ContestModel.getMultiStatus(domainId, { docId: tdoc.docId,
                registrationCancelled: { $in: [true, false, null] } }).toArray(),
            RecordModel.getMulti(domainId, { contest: tdoc.docId })
                .project({ _id: 1, uid: 1, pid: 1, domainId: 1, contest: 1, status: 1, lang: 1, judgeAt: 1 }).toArray(),
        ]);
        const ids = [...new Set(statuses.filter((r) => r.attend && !r.registrationCancelled)
            .flatMap((r) => [r.uid, ...(r.members || [])]))];
        const [users, problems] = await Promise.all([
            UserModel.getListForRender(domainId, ids, false),
            ProblemModel.getList(domainId, tdoc.pids, true, true, ProblemModel.PROJECTION_CONTEST_DETAIL),
        ]);
        return buildLiveData(tdoc, statuses, records, users, problems, SettingModel.langs, new Date(), previousState);
    }).catch((error) => { refreshed.delete(scope); throw error; });
    if (refreshed.size >= 8 && !refreshed.has(scope)) refreshed.delete(refreshed.keys().next().value);
    refreshed.set(scope, { expires: Date.now() + 1500, promise });
    return promise;
}

class PresentationApiHandler extends Handler {
    noCheckPermView = true;
    notUsage = true;
    credential: any;
    cid: string;

    json(status: number, value: any) {
        this.response.status = status;
        this.response.type = 'application/json';
        this.response.template = null;
        this.response.body = JSON.stringify(value);
    }

    async prepare() {
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.addHeader('Vary', 'Authorization');
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        const received = basicCredentials(String(this.request.headers.authorization || ''));
        const c = received && await access.findOne({ _id: accessId(this.domain._id, received.contestId), enabled: true });
        if (!c || c.username !== received.username || c.generation !== received.generation || !matchesPassword(c, received.password)
            || (this.request.params.tid && this.request.params.tid !== c.contestId)) {
            await this.limitRate('arena-presentation-auth', 60, 30);
            this.response.addHeader('WWW-Authenticate', 'Basic realm="HGNUOJ Presentation", charset="UTF-8"');
            this.json(401, { code: 401, message: 'Invalid presentation credentials' });
            return;
        }
        this.credential = c;
        this.cid = c.contestId;
        await this.limitRate('arena-presentation-read', 5, 1000, `${feedHash(scopeFor(this.domain._id, c)).slice(0, 12)}@{{ip}}`);
    }

    async get() {
        if (!this.credential) return;
        try {
            const route = this.request.params.endpoint || '';
            const root = !this.request.params.tid;
            const published = await refresh(this.domain._id, this.credential); const data = published.snapshot;
            const api = { version: '2026-01', version_url: 'https://ccs-specs.icpc.io/2026-01/contest_api', provider: { name: 'HGNUOJ' } };
            if (root) {
                this.json(200, this.request.path.endsWith('/contests') ? [data.contest] : api);
                return;
            }
            if (route === 'event-feed') {
                if (this.request.method.toLowerCase() === 'head') {
                    this.response.type = 'application/x-ndjson';
                    this.response.body = '';
                    return;
                }
                await this.feed(published);
                return;
            }
            if (route === 'images') {
                const image = this.request.params.item;
                if (image === 'logo.png') {
                    this.response.type = fallback.mime;
                    this.response.body = fallback.bytes;
                    return;
                }
                const team = data.collections.teams.find((t) => `${t.id}.png` === image);
                if (!team) {
                    this.json(404, { code: 404, message: 'Image not found' });
                    return;
                }
                const uid = Number(team.label);
                const udoc = await UserModel.getById(this.domain._id, uid);
                const result = await accountImage(udoc, fallback);
                const key = feedHash(result.image.bytes);
                let portrait = portraits.get(key);
                if (!portrait) {
                    portrait = sharp(result.image.bytes, { limitInputPixels: 4096 * 4096 }).rotate()
                        .resize(160, 160, { fit: 'cover', withoutEnlargement: true }).png().toBuffer()
                        .catch(() => fallback.bytes);
                    if (portraits.size >= 64) portraits.delete(portraits.keys().next().value);
                    portraits.set(key, portrait);
                }
                this.response.type = 'image/png';
                this.response.body = await portrait;
                return;
            }
            if (!route) {
                this.json(200, data.contest);
                return;
            }
            if (route === 'state') {
                this.json(200, data.state);
                return;
            }
            if (route === 'scoreboard') {
                this.json(200, data.scoreboard);
                return;
            }
            if (route === 'account') {
                this.json(200, { id: this.credential.username, username: this.credential.username, type: 'spectator' });
                return;
            }
            const collection = data.collections[route];
            if (!collection) {
                this.json(404, { code: 404, message: 'Endpoint not found' });
                return;
            }
            const item = this.request.params.item;
            const value = item ? collection.find((o) => o.id === item) : collection;
            this.json(value ? 200 : 404, value || { code: 404, message: 'Object not found' });
        } catch (error) {
            if (error instanceof InvalidFeedToken) {
                this.json(400, {
                    code: 400, message: 'Contest state changed or invalid event token. Reconnect without since_token.',
                });
            } else this.json(503, { code: 503, message: 'Contest feed temporarily unavailable' });
        }
    }

    async post() { if (this.credential) this.json(405, { code: 405, message: 'Read-only Contest API' }); }

    async feed(published: any) {
        const scope = scopeFor(this.domain._id, this.credential);
        const token = this.request.query.since_token || this.request.query.since_id;
        const outputs = activeStreams.get(scope) || new Set<PassThrough>();
        if (outputs.size >= 8) {
            this.json(429, { code: 429, message: 'Too many presentation streams' });
            return;
        }
        let cursor = token ? await store.resume(scope, String(token), published) : await store.checkpoint(scope, published);
        const stream = new PassThrough({ highWaterMark: 65536 });
        outputs.add(stream);
        activeStreams.set(scope, outputs);
        let closed = false;
        const stop = () => {
            if (closed) return;
            closed = true;
            outputs.delete(stream);
            if (!outputs.size) activeStreams.delete(scope);
            if (!stream.destroyed) stream.end();
        };
        this.context.res.once('close', stop);
        stream.once('close', stop);
        stream.on('error', stop);
        this.context.req.socket.setTimeout(0);
        this.context.compress = false;
        this.response.addHeader('X-Accel-Buffering', 'no');
        this.response.type = 'application/x-ndjson';
        this.response.body = stream;
        const write = async (line: string) => {
            if (closed || stream.destroyed) return;
            if (!stream.write(line)) {
                await new Promise<void>((resolve) => {
                    const timer = setTimeout(() => stream.destroy(), 10000);
                    const done = () => {
                        clearTimeout(timer);
                        stream.off('drain', done);
                        stream.off('close', done);
                        resolve();
                    };
                    stream.once('drain', done); stream.once('close', done);
                });
            }
        };
        const policy = published.snapshot.policy;
        const run = async () => {
            let heartbeat = Date.now();
            while (true) {
                if (closed) break;
                const config = await access.findOne({ _id: this.credential._id, generation: this.credential.generation, enabled: true });
                if (!config) break;
                const current = await refresh(this.domain._id, config);
                if (current.snapshot.policy !== policy) break;
                const rows = await store.read(scope, cursor, current.state);
                const visibleJudgements = new Set<string>(current.snapshot.collections.judgements.map((j) => j.id));
                for (const row of rows) {
                    if (closed) break;
                    const event = publicFeedEvent(row.event, visibleJudgements);
                    await write(`${JSON.stringify({ ...event, token: store.token(scope, row.cursor) })}\n`);
                    cursor = row.cursor;
                }
                if (rows.length >= 250) continue;
                if (Date.now() - heartbeat >= 10000) {
                    await write('\n');
                    heartbeat = Date.now();
                }
                await pause(2000);
            }
        };
        void run().catch(() => { /* Close cleanly; the official client reconnects from its durable token. */ }).finally(stop);
    }

    async after() { /* The read-only API does not render the native contest layout. */ }
}

export function installPresentation(ctx: Context, Base: typeof ArenaBaseHandler, assetVersion: string) {
    class PresentationManageHandler extends Base {
        async get() {
            this.requireJury();
            const { credential: c, password } = await credentials.ensure(
                this.domainId, String(this.tid), this.tdoc.owner, this.session.arenaPresentation,
            );
            delete this.session.arenaPresentation;
            let protocol = this.context.request.protocol || 'http';
            if (String(this.request.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https') protocol = 'https';
            try {
                const configured = new URL(SystemModel.get('server.url'));
                if (configured.host === this.request.host) protocol = configured.protocol.slice(0, -1);
            } catch { /* Local test servers may not configure a canonical URL. */ }
            const apiUrl = new URL(this.url('arena_presentation_contest', { tid: this.tid }), `${protocol}://${this.request.host}`).toString();
            if (this.request.query.download === '1') {
                if (!c.enabled) throw new ValidationError('请先启用展示连接');
                const mode = String(this.request.query.mode || 'scoreboard');
                if (!['scoreboard', 'queue', 'clock', 'rotation'].includes(mode)) throw new ValidationError('无效的展示模式');
                const result = await presentationPackage({ url: apiUrl, username: c.username, password, mode });
                this.binary(result, `${this.tid}-icpc-presentation-${mode}.zip`);
                return;
            }
            this.response.template = 'arena_presentation.html';
            this.response.body = { tdoc: this.tdoc, presentation: { enabled: !!c.enabled, apiUrl, username: c.username,
                password, csrf: this.session.arenaCsrf,
                url: this.url('arena_presentation_manage', { tid: this.tid }),
                script: `/arena-assets/${assetVersion}/presentation-manage.js`,
            } };
        }

        async post() {
            if (!['enable', 'disable', 'reset'].includes(this.request.body.operation)) throw new ValidationError('无效的操作');
        }

        async postEnable() { await this.configure('enable'); }
        async postDisable() { await this.configure('disable'); }
        async postReset() { await this.configure('reset'); }

        async configure(operation: 'enable' | 'disable' | 'reset') {
            this.requireJury();
            if (operation === 'reset') await credentials.reset(this.domainId, String(this.tid), this.user._id);
            else await credentials.setEnabled(this.domainId, String(this.tid), this.user._id, operation === 'enable');
            delete this.session.arenaPresentation;
            await this.get();
        }
    }
    ctx.Route('arena_presentation_manage', '/contest/:tid/arena/presentation', PresentationManageHandler);
    ctx.on('contest/add', async (payload, id) => {
        if (payload.rule !== 'icpc_domjudge') return;
        // Newly created contests use the inserted document's primary _id as their contest ID.
        const tdoc = await db.collection<any>('document').findOne({ _id: id, docType: DocumentModel.TYPE_CONTEST });
        if (tdoc) await credentials.ensure(tdoc.domainId, String(tdoc.docId), tdoc.owner);
    });
    ctx.on('contest/edit', async (tdoc) => {
        if (tdoc.rule === 'icpc_domjudge') await credentials.ensure(tdoc.domainId, String(tdoc.docId), tdoc.owner);
    });
    ctx.on('contest/del', async (domainId, id) => {
        await access.deleteOne({ _id: accessId(domainId, String(id)) });
    });
    ctx.Route('arena_presentation_api', '/contest-api', PresentationApiHandler);
    ctx.Route('arena_presentation_contests', '/contest-api/contests', PresentationApiHandler);
    ctx.Route('arena_presentation_contest', '/contest-api/contests/:tid', PresentationApiHandler);
    ctx.Route('arena_presentation_endpoint', '/contest-api/contests/:tid/:endpoint', PresentationApiHandler);
    ctx.Route('arena_presentation_item', '/contest-api/contests/:tid/:endpoint/:item', PresentationApiHandler);
    ctx.on('app/started', async () => {
        await db.ensureIndexes(batches, { name: 'live_scope_version', key: { scope: 1, kind: 1, version: 1 } });
        await db.ensureIndexes(events, { name: 'live_batch_index', key: { batch: 1, index: 1 }, unique: true });
    });
    ctx.effect(() => () => {
        for (const streams of activeStreams.values()) for (const output of streams) output.destroy();
        activeStreams.clear();
        refreshed.clear();
        portraits.clear();
    });
}
