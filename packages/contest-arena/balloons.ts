import { randomBytes, timingSafeEqual } from 'crypto';
import { ContestModel as contest, Context, ObjectId, PERM, ProblemModel as problem,
    RecordModel as record, UserModel as user, ValidationError } from 'hydrooj';
import { ContestManagementBaseHandler } from 'hydrooj/src/handler/contest';
import { balloonConfig, balloonPalette, balloonView, validateBalloonConfig } from './balloon-data';
import { balloonPushRows, pushSettings } from './balloon-push';
import { pushScope } from './balloon-push-data';

function csrf(handler: any) {
    handler.session.arenaBalloonCsrf ||= randomBytes(24).toString('hex');
    return handler.session.arenaBalloonCsrf;
}

export async function balloonPageData(domainId: string, tdoc: any) {
    const [balloons, statuses] = await Promise.all([
        contest.getMultiBalloon(domainId, tdoc.docId).sort({ _id: 1 }).toArray(),
        contest.getMultiStatus(domainId, { docId: tdoc.docId, registrationCancelled: { $in: [true, false, null] } }).toArray(),
    ]);
    const ids = [...new Set([...statuses.flatMap((s) => [s.uid, ...(s.members || [])]),
        ...balloons.flatMap((b) => [b.uid, ...(typeof b.sent === 'number' ? [b.sent] : [])])])];
    const [users, records] = await Promise.all([
        user.getListForRender(domainId, ids, false),
        balloons.length ? record.getMulti(domainId, { contest: tdoc.docId,
            $or: [{ _id: { $in: balloons.map((b) => b._id) } },
                { status: 1, pid: { $in: [...new Set(balloons.map((b) => b.pid))] } }] })
            .project({ _id: 1, status: 1, uid: 1, pid: 1 }).toArray() : [],
    ]);
    const view = balloonView(tdoc, balloons, users, statuses, records);
    const [rows, config] = await Promise.all([
        balloonPushRows(domainId, tdoc.docId, view.rows),
        pushSettings.findOne({ _id: pushScope(domainId, String(tdoc.docId)), enabled: true }, { projection: { _id: 1 } }),
    ]);
    return { ...view, rows, pushEnabled: !!config };
}

class BalloonManagementHandler extends ContestManagementBaseHandler {
    async __prepare() {
        this.args.domainId = this.domain._id;
        const tid = this.request.params.tid;
        if (!ObjectId.isValid(tid)) throw new ValidationError('比赛');
        await super.__prepare(this.domain._id, new ObjectId(tid));
        this.args.tid = this.tdoc.docId;
    }

    async prepare() {
        await super.prepare();
        this.response.addHeader('Cache-Control', 'private, no-store');
        if (this.request.method.toLowerCase() !== 'post') return;
        const expected = Buffer.from(csrf(this)); const received = Buffer.from(String(this.request.body.csrf || ''));
        if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
            throw new ValidationError('页面已过期，请刷新后重试');
        }
    }

    async get() {
        this.response.body = { ...(await balloonPageData(this.domain._id, this.tdoc)), csrf: csrf(this),
            enabled: !!this.tdoc.balloon && Object.keys(this.tdoc.balloon).length > 0 && !this.tdoc.balloonDisabled,
            config: balloonConfig(this.tdoc) };
    }

    async postConfigure() { return this.post(); }
    async postDisable() { return this.post(); }
    async postDeliver() { return this.post(); }
    async postUndo() { return this.post(); }

    async post() {
        const operation = String(this.request.body.operation || '');
        if (operation === 'configure') {
            let config;
            try { config = validateBalloonConfig(this.tdoc.pids, this.request.body.config); } catch (error) {
                throw new ValidationError(error.message);
            }
            await contest.edit(this.domain._id, this.tdoc.docId, { balloon: config, balloonDisabled: false });
        } else if (operation === 'disable') {
            await contest.edit(this.domain._id, this.tdoc.docId, { balloonDisabled: true });
        } else if (operation === 'deliver' || operation === 'undo') {
            const ids = this.request.body.ids;
            if (!Array.isArray(ids) || !ids.length || ids.length > 200
                || ids.some((id) => typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id))) {
                throw new ValidationError('请选择 1–200 个气球');
            }
            const unique = [...new Set<string>(ids)];
            const view = await balloonPageData(this.domain._id, this.tdoc);
            const selected = unique.map((id) => view.rows.find((row) => row.id === id));
            if (selected.some((row) => !row || (operation === 'deliver' && row.withdrawn))) {
                throw new ValidationError('所选气球不存在、已取消报名或已不满足通过条件，请刷新后重试');
            }
            await Promise.all(unique.map((id) => contest.setBalloonDelivery(this.domain._id, this.tdoc.docId,
                new ObjectId(id), operation === 'deliver' ? this.user._id : null)));
        } else throw new ValidationError('未知的气球操作');
        const tdoc = await contest.get(this.domain._id, this.tdoc.docId);
        this.response.body = { ok: true, ...(await balloonPageData(this.domain._id, tdoc)),
            enabled: !!tdoc.balloon && Object.keys(tdoc.balloon).length > 0 && !tdoc.balloonDisabled,
            config: balloonConfig(tdoc) };
    }
}

export function installBalloons(ctx: Context, assetVersion: string) {
    ctx.Route('arena_balloons_api', '/contest/:tid/balloons-api', BalloonManagementHandler, PERM.PERM_VIEW_CONTEST);
    ctx.on('handler/after/ContestBalloon#get', async (handler) => {
        const tdoc = handler.tdoc;
        const [view, pdict] = await Promise.all([
            balloonPageData(handler.domain._id, tdoc),
            problem.getList(handler.domain._id, tdoc.pids, true, true, problem.PROJECTION_CONTEST_LIST),
        ]);
        const config = balloonConfig(tdoc);
        handler.response.body = { ...handler.response.body, tdoc, tsdoc: handler.tsdoc, page_name: 'arena_balloons',
            balloon: { ...view, enabled: !!tdoc.balloon && Object.keys(tdoc.balloon).length > 0 && !tdoc.balloonDisabled,
                palette: balloonPalette, csrf: csrf(handler),
                problems: tdoc.pids.map((pid, index) => ({ pid, label: String.fromCharCode(65 + index),
                    title: pdict[pid]?.title || `P${pid}`, ...config[pid] })),
                api: handler.url('arena_balloons_api', { tid: tdoc.docId }),
                pushApi: handler.url('arena_balloon_push', { tid: tdoc.docId }),
                pushJs: `/arena-assets/${assetVersion}/balloon-push.js`,
                js: `/arena-assets/${assetVersion}/balloons.js`, css: `/arena-assets/${assetVersion}/balloons.css` } };
        handler.response.template = 'arena_balloons.html';
        handler.response.pjax = null;
    });
}
