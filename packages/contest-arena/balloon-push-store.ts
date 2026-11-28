/* eslint-disable no-await-in-loop -- Persist and recover each assignment before advancing the next one. */
import { randomBytes } from 'crypto';
import { deliveryLink, matchesDeliveryToken, newDeliveryToken, nextPushRunner,
    pushBaseUrl, pushJobId, pushMessage, PushSecrets, retrySeconds, secretHash, validPushSpt } from './balloon-push-data';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export class PushBusy extends Error {}
export class InvalidDeliveryLink extends Error {}

export class BalloonPushStore {
    constructor(public settings: any, public jobs: any, public secrets: PushSecrets, public now = () => new Date()) {}

    async scopeLock<T>(scope: string, callback: (config: any, owner: string) => Promise<T>) {
        try {
            await this.settings.updateOne({ _id: scope }, { $setOnInsert: { enabled: false, runners: [],
                sequence: 0, lastUid: null, leaseUntil: new Date(0), revision: '' } }, { upsert: true });
        } catch (error) { if (error.code !== 11000) throw error; }
        const owner = randomBytes(16).toString('hex'); let config;
        for (let i = 0; i < 40; i++) {
            config = await this.settings.findOneAndUpdate({ _id: scope, leaseUntil: { $lte: this.now() } },
                { $set: { leaseOwner: owner, leaseUntil: new Date(+this.now() + 60000) } }, { returnDocument: 'after' });
            if (config) break;
            await pause(50);
        }
        if (!config) throw new PushBusy('气球分配正在处理，请稍后重试');
        try {
            if (config.reservation) {
                await this.jobs.updateOne({ _id: config.reservation._id }, { $setOnInsert: config.reservation }, { upsert: true });
                await this.settings.updateOne({ _id: scope, leaseOwner: owner }, { $unset: { reservation: '' } });
            }
            return await callback(config, owner);
        } finally {
            await this.settings.updateOne({ _id: scope, leaseOwner: owner }, { $unset: { leaseOwner: '' }, $set: { leaseUntil: new Date(0) } });
        }
    }

    async publicSettings(scope: string, fallbackUrl = '') {
        const c = await this.settings.findOne({ _id: scope });
        return { enabled: !!c?.enabled, baseUrl: c?.baseUrl || fallbackUrl, revision: c?.revision || '',
            nextName: nextPushRunner(c?.runners || [], c?.lastUid)?.name || '',
            runners: (c?.runners || []).map((r) => ({ uid: r.uid, username: r.username, name: r.name,
                active: !!r.active, hasSpt: !!r.sptBox })) };
    }

    async configure(scope: string, input: any, runners: any[], actor: number) {
        if (typeof input.enabled !== 'boolean' || !Array.isArray(runners) || runners.length > 20) throw new Error('推送配置无效');
        const baseUrl = pushBaseUrl(input.baseUrl);
        return this.scopeLock(scope, async (old, owner) => {
            if (String(input.revision || '') !== old.revision) throw new Error('配置已被其他管理员修改，请刷新后重试');
            const normalized = []; const seenUids = new Set();
            const seenSpts = new Set(); const changed = [];
            for (const r of runners) {
                if (!Number.isSafeInteger(r.uid) || r.uid <= 0 || seenUids.has(r.uid)) throw new Error('发放员账号无效或重复');
                seenUids.add(r.uid);
                const previous = old.runners.find((p) => p.uid === r.uid);
                const spt = String(r.spt || '').trim();
                if ((spt && !validPushSpt(spt)) || (!spt && !previous?.sptBox)) throw new Error(`${r.name} 的 SPT 无效或尚未填写`);
                const fingerprint = spt ? secretHash(spt) : previous.fingerprint;
                if (seenSpts.has(fingerprint)) throw new Error('不同发放员应使用各自的 SPT');
                seenSpts.add(fingerprint);
                const version = previous?.fingerprint === fingerprint ? previous.version : randomBytes(12).toString('hex');
                if (previous && previous.version !== version) changed.push(r.uid);
                normalized.push({ uid: r.uid, username: r.username, name: r.name, active: r.active !== false,
                    fingerprint, version, sptBox: spt ? await this.secrets.seal(spt, `${scope}/${r.uid}/spt`) : previous.sptBox });
            }
            if (input.enabled && !normalized.some((r) => r.active)) throw new Error('至少启用一位发放员');
            const removed = old.runners.filter((r) => !seenUids.has(r.uid)).map((r) => r.uid);
            if (removed.length && await this.jobs.findOne({ scope, uid: { $in: removed },
                status: { $in: ['pending', 'sending', 'notified', 'failed'] } })) {
                throw new Error('待移除的发放员还有未完成任务，请先暂停接收并转派这些任务');
            }
            const now = this.now();
            const result = await this.settings.updateOne({ _id: scope, leaseOwner: owner }, { $set: {
                enabled: input.enabled, baseUrl, runners: normalized, actor, updatedAt: now,
                activatedAt: !old.enabled && input.enabled ? now : old.activatedAt || now,
                revision: randomBytes(12).toString('hex'),
            } });
            if (!result.matchedCount) throw new PushBusy('推送配置锁已失效，请重试');
            const query: any = { scope, status: { $in: ['pending', 'sending', 'notified', 'failed'] } };
            if (old.baseUrl !== baseUrl || changed.length) {
                if (old.baseUrl === baseUrl) query.uid = { $in: changed };
                await this.jobs.updateMany(query, { $set: { status: 'pending', nextAttemptAt: now, tokenHash: null, requiresRefresh: true } });
            }
            return this.publicSettings(scope);
        });
    }

    async tokenFields(id: string) {
        const token = newDeliveryToken();
        return { tokenHash: secretHash(token), tokenBox: await this.secrets.seal(token, `${id}/token`) };
    }

    async assign(scope: string, task: any) {
        const id = pushJobId(scope, task.balloonId);
        const existing = await this.jobs.findOne({ _id: id }); if (existing) return existing;
        if (!(await this.settings.findOne({ _id: scope, enabled: true }))) return null;
        return this.scopeLock(scope, async (c, owner) => {
            const recovered = await this.jobs.findOne({ _id: id }); if (recovered) return recovered;
            if (!c.enabled) return null;
            const runner = nextPushRunner(c.runners, c.lastUid); if (!runner) return null;
            const now = this.now();
            if (+task.expiresAt <= +now) return null;
            const job = { _id: id, scope, domainId: task.domainId, contestId: task.contestId, balloonId: task.balloonId,
                uid: runner.uid, name: runner.name, recipientVersion: runner.version, baseUrl: c.baseUrl,
                sequence: c.sequence + 1, status: 'pending', attempts: 0, nextAttemptAt: now, createdAt: now,
                expiresAt: task.expiresAt, leaseUntil: new Date(0), revision: 1, ...await this.tokenFields(id) };
            const saved = await this.settings.updateOne({ _id: scope, leaseOwner: owner },
                { $set: { reservation: job, lastUid: runner.uid, sequence: job.sequence } });
            if (!saved.matchedCount) throw new PushBusy('气球分配锁已失效，请重试');
            await this.jobs.updateOne({ _id: id }, { $setOnInsert: job }, { upsert: true });
            await this.settings.updateOne({ _id: scope, leaseOwner: owner }, { $unset: { reservation: '' } });
            return job;
        });
    }

    async jobLock<T>(id: string, callback: (job: any, owner: string) => Promise<T>) {
        const owner = randomBytes(16).toString('hex'); let job;
        for (let i = 0; i < 20; i++) {
            job = await this.jobs.findOneAndUpdate({ _id: id, leaseUntil: { $lte: this.now() } },
                { $set: { leaseOwner: owner, leaseUntil: new Date(+this.now() + 60000) } }, { returnDocument: 'after' });
            if (job) break;
            if (!await this.jobs.findOne({ _id: id })) throw new InvalidDeliveryLink('链接无效或已过期');
            await pause(50);
        }
        if (!job) throw new PushBusy('这条气球正在处理，请稍后重试');
        try { return await callback(job, owner); } finally {
            await this.jobs.updateOne({ _id: id, leaseOwner: owner }, { $unset: { leaseOwner: '' }, $set: { leaseUntil: new Date(0) } });
        }
    }

    async authorize(id: string, token: unknown, known?: any) {
        if (!/^[a-f0-9]{64}$/.test(id)) throw new InvalidDeliveryLink('链接无效或已过期');
        const job = known || await this.jobs.findOne({ _id: id });
        if (!job || !matchesDeliveryToken(job.tokenHash, token) || +job.expiresAt <= +this.now()
            || ['cancelled', 'expired'].includes(job.status)) throw new InvalidDeliveryLink('链接无效或已过期');
        const c = await this.settings.findOne({ _id: job.scope });
        const runner = c?.runners.find((r) => r.uid === job.uid && r.version === job.recipientVersion);
        if (!runner) throw new InvalidDeliveryLink('链接已失效，请使用最新通知中的链接');
        return { job, config: c, runner };
    }

    async renew(id: string, uid: number | null = null, expectedReason?: string) {
        return this.jobLock(id, async (job, owner) => {
            if (expectedReason && (job.status !== 'cancelled' || job.cancelReason !== expectedReason)) return job;
            const c = await this.settings.findOne({ _id: job.scope });
            const runner = c?.runners.find((r) => r.uid === (uid ?? job.uid));
            if (!runner || +job.expiresAt <= +this.now()) throw new Error('发放员或气球任务已失效');
            const fields = { uid: runner.uid, name: runner.name, recipientVersion: runner.version, baseUrl: c.baseUrl,
                ...await this.tokenFields(id), status: 'pending', attempts: 0, nextAttemptAt: this.now(),
                requiresRefresh: false, lastError: '', cancelReason: '', revision: job.revision + 1 };
            await this.jobs.updateOne({ _id: id, leaseOwner: owner }, { $set: fields });
            return { ...job, ...fields };
        });
    }

    async process(id: string, valid: (job: any) => Promise<any>, send: (spt: string, message: any) => Promise<void>) {
        return this.jobLock(id, async (job, owner) => {
            const now = this.now(); const c = await this.settings.findOne({ _id: job.scope });
            if (!c?.enabled || !['pending', 'sending'].includes(job.status) || +job.nextAttemptAt > +now) return;
            if (+job.expiresAt <= +now) {
                await this.jobs.updateOne({ _id: id, leaseOwner: owner }, { $set: { status: 'expired', tokenHash: null } }); return;
            }
            const runner = c.runners.find((r) => r.uid === job.uid);
            const view = await valid(job);
            if (!runner || !view || view.withdrawn || view.delivered) {
                await this.jobs.updateOne({ _id: id, leaseOwner: owner }, { $set: {
                    status: view?.delivered ? 'done' : 'cancelled',
                    ...(view?.delivered ? {} : { tokenHash: null, cancelReason: 'withdrawn' }) } }); return;
            }
            if (job.requiresRefresh || job.recipientVersion !== runner.version || job.baseUrl !== c.baseUrl) {
                Object.assign(job, await this.tokenFields(id), { recipientVersion: runner.version, baseUrl: c.baseUrl,
                    requiresRefresh: false, revision: job.revision + 1, attempts: 0 });
                await this.jobs.updateOne({ _id: id, leaseOwner: owner }, { $set: { tokenHash: job.tokenHash, tokenBox: job.tokenBox,
                    recipientVersion: job.recipientVersion, baseUrl: job.baseUrl, requiresRefresh: false, revision: job.revision, attempts: 0 } });
            }
            const sending = await this.jobs.updateOne({ _id: id, leaseOwner: owner, status: { $in: ['pending', 'sending'] } },
                { $set: { status: 'sending' } });
            if (!sending.matchedCount) return;
            try {
                const spt = await this.secrets.open(runner.sptBox, `${job.scope}/${runner.uid}/spt`);
                const token = await this.secrets.open(job.tokenBox, `${id}/token`);
                await send(spt, pushMessage(job, view, c.baseUrl, token));
                await this.jobs.updateOne({ _id: id, leaseOwner: owner, status: 'sending' }, { $set: {
                    status: 'notified', notifiedAt: this.now(), lastError: '', attempts: job.attempts + 1 } });
            } catch (error) {
                const attempts = job.attempts + 1; const status = attempts >= retrySeconds.length ? 'failed' : 'pending';
                await this.jobs.updateOne({ _id: id, leaseOwner: owner, status: 'sending' }, { $set: { status,
                    attempts, lastError: String(error.message || '推送失败').replace(/SPT_[^\s"<>]+/g, '[已隐藏]').slice(0, 160),
                    nextAttemptAt: new Date(+this.now() + retrySeconds[Math.min(attempts - 1, retrySeconds.length - 1)] * 1000) } });
            }
        });
    }

    async link(job: any) {
        return deliveryLink(job.baseUrl, job._id, await this.secrets.open(job.tokenBox, `${job._id}/token`));
    }
}
