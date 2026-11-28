/* eslint-disable no-await-in-loop -- Dispatch durable assignments in sequence; each job owns its delivery lease. */
import { randomBytes } from 'crypto';
import { ContestModel as contest, Context, db, Handler, Logger, ObjectId, PERM,
    UserModel as user, ValidationError } from 'hydrooj';
import { ContestManagementBaseHandler } from 'hydrooj/src/handler/contest';
import { pushJobId, pushScope, PushSecrets, sendWxPusher } from './balloon-push-data';
import { BalloonPushStore, InvalidDeliveryLink, PushBusy } from './balloon-push-store';

const logger = new Logger('balloon-push');
export const pushSettings = db.collection<any>('contest.arena.balloon.push');
export const pushJobs = db.collection<any>('contest.arena.balloon.dispatch');
let keyring: Promise<string[]>;
const keys = () => {
    keyring ||= (async () => {
        const system = db.collection<any>('system'); const _id = 'arena.balloon.push.keys';
        try {
            await system.updateOne({ _id }, { $setOnInsert: { value: [randomBytes(32).toString('hex')] } }, { upsert: true });
        } catch (error) { if (error.code !== 11000) throw error; }
        const value = (await system.findOne({ _id }))?.value;
        if (!Array.isArray(value) || !value.length || value.some((k) => typeof k !== 'string' || k.length < 32)) {
            throw new Error('气球通知的服务器密钥配置无效');
        }
        return value;
    })().catch((error) => { keyring = null; throw error; });
    return keyring;
};
export const balloonPush = new BalloonPushStore(pushSettings, pushJobs, new PushSecrets(keys));
let readBalloons: (domainId: string, tdoc: any) => Promise<any>;

export async function balloonPushRows(domainId: string, tid: any, rows: any[]) {
    const jobs = await pushJobs.find({ scope: pushScope(domainId, String(tid)) })
        .project({ balloonId: 1, uid: 1, name: 1, status: 1, attempts: 1, lastError: 1, expiresAt: 1 }).toArray();
    const map = new Map(jobs.map((job) => [job.balloonId, job]));
    return rows.map((row) => {
        const job = map.get(row.id);
        return { ...row, push: job ? { id: job._id, uid: job.uid, name: job.name, status: job.status,
            attempts: job.attempts, error: job.lastError || '', expiresAt: job.expiresAt?.toISOString() || '' } : null };
    });
}

async function currentTask(job: any) {
    let tdoc;
    try {
        tdoc = await contest.get(job.domainId, new ObjectId(job.contestId));
    } catch { return null; }
    const view = await readBalloons(job.domainId, tdoc);
    const row = view.rows.find((item) => item.id === job.balloonId);
    return row ? { ...row, contestTitle: tdoc.title } : null;
}

function nativeCsrf(handler: any) {
    handler.session.arenaBalloonCsrf ||= randomBytes(24).toString('hex');
    return handler.session.arenaBalloonCsrf;
}

export function installBalloonPush(ctx: Context, assetVersion: string, read: typeof readBalloons) {
    readBalloons = read;
    const synchronizeExpiry = async (tdoc: any) => {
        const end = +tdoc.endAt;
        if (!Number.isFinite(end)) return;
        const expiresAt = new Date(end + 2 * 3600000); const now = new Date();
        const expired = { $or: [{ $lte: ['$expiresAt', now] }, { $lte: [expiresAt, now] }] };
        // Evaluate the old deadline atomically so extending a contest cannot revive an expired link.
        await pushJobs.updateMany({ scope: pushScope(tdoc.domainId, String(tdoc.docId)),
            $or: [{ expiresAt: { $ne: expiresAt } }, { expiresAt: { $lte: now }, tokenHash: { $ne: null } }] },
        [{ $set: { expiresAt,
            tokenHash: { $cond: [expired, null, '$tokenHash'] },
            status: { $cond: [{ $and: [expired, { $in: ['$status', ['pending', 'sending', 'notified', 'failed']] }] },
                'expired', '$status'] } } }]);
    };
    class PushManagementHandler extends ContestManagementBaseHandler {
        async __prepare() {
            this.args.domainId = this.domain._id;
            if (!ObjectId.isValid(this.request.params.tid)) throw new ValidationError('比赛');
            await super.__prepare(this.domain._id, new ObjectId(this.request.params.tid));
            this.args.tid = this.tdoc.docId;
        }

        async prepare() {
            await super.prepare();
            this.response.addHeader('Cache-Control', 'private, no-store');
            if (this.request.method.toLowerCase() === 'post'
                && this.request.body.csrf !== nativeCsrf(this)) throw new ValidationError('页面已过期，请刷新后重试');
        }

        async get() {
            const protocol = this.request.headers['x-forwarded-proto'] === 'https' ? 'https' : this.context.request.protocol || 'http';
            this.response.body = { ...await balloonPush.publicSettings(pushScope(this.domain._id, String(this.tdoc.docId)),
                `${protocol}://${this.request.host}`), csrf: nativeCsrf(this) };
        }

        async postConfigure() {
            const scope = pushScope(this.domain._id, String(this.tdoc.docId));
            const input = this.request.body;
            if (!Array.isArray(input.runners) || input.runners.length > 20) throw new ValidationError('最多配置 20 位发放员');
            const runners = [];
            for (const r of input.runners) {
                if (!r || typeof r.account !== 'string' || r.account.length > 100 || typeof r.active !== 'boolean') {
                    throw new ValidationError('发放员配置无效');
                }
                const account = r.account.trim();
                const u = /^\d+$/.test(account) ? await user.getById(this.domain._id, Number(account))
                    : await user.getByUname(this.domain._id, account);
                if (!u || u._id <= 0 || u.uname === 'Hydro') throw new ValidationError(`找不到发放员账号：${account}`);
                runners.push({ uid: u._id, username: u.uname, name: u.name || u.displayName || u.uname,
                    active: r.active, spt: r.spt });
            }
            try {
                this.response.body = { ok: true, ...await balloonPush.configure(scope, input, runners, this.user._id) };
            } catch (error) { throw new ValidationError(error.message); }
        }

        async postResend() { return this.manageTask(false); }
        async postTransfer() { return this.manageTask(true); }

        async postTest() {
            const scope = pushScope(this.domain._id, String(this.tdoc.docId));
            const c = await pushSettings.findOne({ _id: scope });
            const runner = c?.runners.find((r) => r.uid === Number(this.request.body.uid));
            if (!runner) throw new ValidationError('请先保存发放员的推送配置');
            await this.limitRate('balloon-push-test', 60, 6);
            try {
                const spt = await balloonPush.secrets.open(runner.sptBox, `${scope}/${runner.uid}/spt`);
                await sendWxPusher(spt, { summary: 'HGNUOJ 气球通知测试', contentType: 1,
                    content: 'HGNUOJ 气球通知已连接。此消息用于测试接收配置，不会生成气球任务。' });
            } catch { throw new ValidationError('测试推送失败，请检查 SPT 或稍后重试'); }
            this.response.body = { ok: true };
        }

        async postNotify() {
            const id = String(this.request.body.balloon || '');
            if (!/^[a-f0-9]{24}$/.test(id)) throw new ValidationError('气球');
            const scope = pushScope(this.domain._id, String(this.tdoc.docId));
            const row = (await readBalloons(this.domain._id, this.tdoc)).rows.find((r) => r.id === id);
            if (!row || row.status !== 'pending') throw new ValidationError('该气球已发放或已撤销');
            const job = await balloonPush.assign(scope, { domainId: this.domain._id, contestId: String(this.tdoc.docId),
                balloonId: id, expiresAt: new Date(+this.tdoc.endAt + 2 * 3600000) });
            if (!job) throw new ValidationError('请先启用通知、配置发放员，并检查比赛结束时间');
            this.response.body = { ok: true };
        }

        async manageTask(transfer: boolean) {
            const id = String(this.request.body.id || '');
            const scope = pushScope(this.domain._id, String(this.tdoc.docId));
            const job = /^[a-f0-9]{64}$/.test(id) && await pushJobs.findOne({ _id: id, scope });
            if (!job) throw new ValidationError('气球通知不存在');
            const task = await currentTask(job);
            if (!task || task.withdrawn || task.delivered) throw new ValidationError('该气球已发放或不再满足发放条件');
            const uid = transfer ? Number(this.request.body.uid) : null;
            if (transfer && (!Number.isSafeInteger(uid) || uid <= 0)) throw new ValidationError('请选择发放员');
            try {
                await balloonPush.renew(id, uid);
            } catch (error) { throw new ValidationError(error.message); }
            this.response.body = { ok: true };
        }
    }

    class DeliveryPageHandler extends Handler {
        noCheckPermView = true;
        notUsage = true;
        async get() {
            this.response.addHeader('Cache-Control', 'private, no-store');
            this.response.addHeader('Referrer-Policy', 'no-referrer');
            this.response.addHeader('X-Robots-Tag', 'noindex, nofollow');
            this.response.addHeader('X-Frame-Options', 'DENY');
            this.response.template = 'arena_balloon_delivery.html';
            this.response.body = { delivery: { id: /^[a-f0-9]{64}$/.test(this.request.params.delivery) ? this.request.params.delivery : '',
                css: `/arena-assets/${assetVersion}/balloon-delivery.css`, js: `/arena-assets/${assetVersion}/balloon-delivery.js` } };
        }

        async after() { /* No login, navigation, account mode watcher or third-party assets on capability pages. */ }
    }

    class DeliveryApiHandler extends Handler {
        noCheckPermView = true;
        notUsage = true;
        async prepare() {
            this.response.addHeader('Cache-Control', 'private, no-store');
            this.response.addHeader('Referrer-Policy', 'no-referrer');
            this.response.addHeader('X-Robots-Tag', 'noindex, nofollow');
            await this.limitRate('balloon-delivery-read', 60, 180);
        }

        async authorized(known?: any) {
            return balloonPush.authorize(String(this.request.params.delivery || ''), this.request.headers['x-balloon-token'], known);
        }

        async output(job: any) {
            const row = await currentTask(job);
            if (!row || row.withdrawn || (job.status === 'done' && !row.delivered)) {
                throw new InvalidDeliveryLink('此任务已撤销，请联系比赛管理员');
            }
            this.response.body = { ok: true, task: { contest: row.contestTitle, team: row.team, className: row.className,
                classroom: row.classroom, seat: row.seat,
                label: row.label, color: row.color, colorName: row.colorName, receiver: job.name,
                delivered: row.delivered, sender: row.sender, sentAt: row.sentAt } };
        }

        async get() {
            try {
                await this.output((await this.authorized()).job);
            } catch (error) { this.failure(error); }
        }

        async postConfirm() {
            try {
                await this.authorized();
                await balloonPush.jobLock(String(this.request.params.delivery || ''), async (job, owner) => {
                    await this.authorized(job);
                    const task = await currentTask(job);
                    if (!task || task.withdrawn || (job.status === 'done' && !task.delivered)) {
                        throw new InvalidDeliveryLink('此任务已撤销，请联系比赛管理员');
                    }
                    if (!task.delivered) {
                        await contest.setBalloonDelivery(job.domainId, new ObjectId(job.contestId),
                            new ObjectId(job.balloonId), job.uid);
                    }
                    await pushJobs.updateOne({ _id: job._id, leaseOwner: owner }, { $set: {
                        status: 'done', confirmedAt: new Date(), confirmedVia: 'wxpusher-link' } });
                    await this.output({ ...job, status: 'done' });
                });
            } catch (error) { this.failure(error); }
        }

        failure(error: any) {
            this.response.status = error instanceof PushBusy ? 409 : 403;
            this.response.body = { ok: false, message: error instanceof InvalidDeliveryLink || error instanceof PushBusy
                ? error.message : '暂时无法处理，请稍后重试' };
        }

        async after() { /* Token-scoped JSON responses do not use the native contest projection. */ }
    }

    ctx.Route('arena_balloon_push', '/contest/:tid/balloon-push', PushManagementHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('arena_balloon_delivery', '/balloon-delivery/:delivery', DeliveryPageHandler);
    ctx.Route('arena_balloon_delivery_api', '/balloon-delivery/:delivery/api', DeliveryApiHandler);

    ctx.on('contest/balloon', async (domainId, tid, bdoc) => {
        try {
            const scope = pushScope(domainId, String(tid));
            const config = await pushSettings.findOne({ _id: scope, enabled: true });
            if (!config || bdoc.sent || +(bdoc.createdAt || bdoc._id.getTimestamp()) < +config.activatedAt) return;
            const tdoc = await contest.get(domainId, tid);
            await balloonPush.assign(scope, { domainId, contestId: String(tid), balloonId: String(bdoc._id),
                expiresAt: new Date(+tdoc.endAt + 2 * 3600000) });
        } catch { logger.warn('气球通知排队暂时失败，后台任务将继续恢复'); }
    });
    ctx.on('contest/balloon-delivery', async (domainId, tid, id, sender) => {
        try {
            await pushJobs.updateOne({ _id: pushJobId(pushScope(domainId, String(tid)), String(id)) }, { $set: sender === null
                ? { status: 'cancelled', tokenHash: null, cancelReason: 'undo', lastError: '管理员撤销了发放标记' }
                : { status: 'done', confirmedAt: new Date() } });
        } catch { logger.warn('气球通知状态暂时无法同步，后台任务会重新核对'); }
    });
    ctx.on('contest/edit', async (tdoc) => {
        try {
            await synchronizeExpiry(tdoc);
        } catch {
            logger.warn('气球链接有效期暂时无法同步，请稍后重试');
        }
    });
    ctx.on('contest/del', async (domainId, tid) => {
        const scope = pushScope(domainId, String(tid));
        await pushSettings.deleteOne({ _id: scope }); await pushJobs.deleteMany({ scope });
    });

    let running = false;
    const tick = async () => {
        if (running) return; running = true;
        try {
            await pushJobs.updateMany({ status: { $in: ['pending', 'sending', 'notified', 'failed'] },
                expiresAt: { $lte: new Date() } }, { $set: { status: 'expired', tokenHash: null } });
            const configs = await pushSettings.find({ $or: [{ enabled: true }, { reservation: { $exists: true } }] }).toArray();
            for (const c of configs) {
                if (c.reservation) await balloonPush.scopeLock(c._id, async () => {});
                if (!c.enabled) continue;
                const [domainId, contestId] = JSON.parse(c._id);
                let tdoc;
                try {
                    tdoc = await contest.get(domainId, new ObjectId(contestId));
                } catch { continue; }
                await synchronizeExpiry(tdoc);
                if (!tdoc.balloon || tdoc.balloonDisabled || Date.now() >= +tdoc.endAt + 2 * 3600000) continue;
                const rows = await readBalloons(domainId, tdoc);
                await pushJobs.updateMany({ scope: c._id, balloonId: { $nin: rows.rows.map((r) => r.id) },
                    status: { $in: ['pending', 'sending', 'notified', 'failed'] } },
                { $set: { status: 'cancelled', tokenHash: null, cancelReason: 'withdrawn' } });
                const withdrawn = rows.rows.filter((r) => r.withdrawn).map((r) => r.id);
                const delivered = rows.rows.filter((r) => r.delivered).map((r) => r.id);
                if (withdrawn.length) {
                    await pushJobs.updateMany({ scope: c._id, balloonId: { $in: withdrawn },
                        status: { $in: ['pending', 'sending', 'notified', 'failed'] } },
                    { $set: { status: 'cancelled', tokenHash: null, cancelReason: 'withdrawn' } });
                }
                if (delivered.length) {
                    await pushJobs.updateMany({ scope: c._id, balloonId: { $in: delivered },
                        status: { $in: ['pending', 'sending', 'notified', 'failed'] } }, { $set: { status: 'done' } });
                }
                const pendingIds = new Set(rows.rows.filter((r) => r.status === 'pending').map((r) => r.id));
                const restored = await pushJobs.find({ scope: c._id, status: 'cancelled', cancelReason: 'withdrawn',
                    expiresAt: { $gt: new Date() } }).toArray();
                for (const job of restored) {
                    if (pendingIds.has(job.balloonId) && c.runners.some((runner) => runner.uid === job.uid)) {
                        await balloonPush.renew(job._id, null, 'withdrawn');
                    }
                }
                const active = rows.rows.filter((r) => r.status === 'pending'
                    && +new Date(r.createdAt) >= +c.activatedAt);
                for (const row of active) {
                    await balloonPush.assign(c._id, { domainId, contestId,
                        balloonId: row.id, expiresAt: new Date(+tdoc.endAt + 2 * 3600000) });
                }
            }
            const due = await pushJobs.find({ scope: { $in: configs.filter((c) => c.enabled).map((c) => c._id) },
                status: { $in: ['pending', 'sending'] }, nextAttemptAt: { $lte: new Date() },
                leaseUntil: { $lte: new Date() } }).sort({ nextAttemptAt: 1 }).limit(3).toArray();
            await Promise.all(due.map(async (job) => {
                try {
                    await balloonPush.process(job._id, currentTask, sendWxPusher);
                } catch (error) {
                    if (!(error instanceof PushBusy)) logger.warn('气球通知暂时无法处理，将稍后重试');
                }
            }));
        } catch { logger.warn('气球推送调度暂时失败，将稍后重试'); } finally { running = false; }
    };
    ctx.on('app/started', async () => {
        await db.ensureIndexes(pushJobs, { name: 'balloon_push_due', key: { status: 1, nextAttemptAt: 1, leaseUntil: 1 } },
            { name: 'balloon_push_scope', key: { scope: 1, uid: 1 } });
        ctx.interval(tick, 5000);
    });
}
