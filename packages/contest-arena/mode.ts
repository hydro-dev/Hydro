import { ContestModel as contest, Context, Handler, ObjectId, PERM, PermissionError, ProblemModel as problem, RecordModel as record } from 'hydrooj';
import { modeFor, modes, imports } from './enrollment';

async function permitted(context: any, mode: Awaited<ReturnType<typeof modeFor>>) {
    const request = context.HydroContext.request;
    const path = request.path, method = request.method.toLowerCase();
    if (path === '/arena-mode/status' && method === 'get') return true;
    if (['get', 'head'].includes(method) && /^\/arena-assets\/(?:[a-f0-9]{16}|logo)\/(?:[\w.-]+|fonts\/[\w.-]+)$/.test(path)) return true;
    // This endpoint only streams files after checking the expiring server-signed link.
    if (path === '/storage' && ['get', 'head'].includes(method)) return true;
    const args = context.HydroContext.args;
    if (context.HydroContext.domain?._id !== mode.tdoc.domainId || args.domainId !== mode.tdoc.domainId) return false;
    const arena = `/contest/${mode.tdoc.docId}/arena`;
    if (path === arena || path.startsWith(`${arena}/`)) return true;
    const query = context.query;
    const submission = /^\/p\/([0-9]+)\/submit$/.exec(path);
    if (submission && method === 'post' && query.tid === String(mode.tdoc.docId)
        && String(args.tid) === String(mode.tdoc.docId) && (args.pid === undefined || String(args.pid) === submission[1])
        && mode.tdoc.pids.includes(+submission[1])) return true;
    const source = /^\/record\/([a-f0-9]{24})$/.exec(path);
    if (source && method === 'get' && query.download === 'true' && (args.rid === undefined || String(args.rid) === source[1])) {
        const rdoc = await record.get(mode.tdoc.domainId, new ObjectId(source[1]));
        const team = await contest.getStatus(mode.tdoc.domainId, mode.tdoc.docId, mode.binding.participantUid);
        return String(rdoc?.contest) === String(mode.tdoc.docId)
            && (rdoc.uid === mode.binding._id || team?.members?.includes(rdoc.uid));
    }
    if (!['get', 'head'].includes(method) || Date.now() < +mode.tdoc.beginAt) return false;
    const attachment = /^\/p\/([0-9]+)\/file\//.exec(path);
    if (attachment && query.tid === String(mode.tdoc.docId) && String(args.tid) === String(mode.tdoc.docId)
        && (args.pid === undefined || String(args.pid) === attachment[1]) && mode.tdoc.pids.includes(+attachment[1])) return true;
    if (path.startsWith('/file/')) {
        for (const pid of mode.tdoc.pids) {
            const pdoc = await problem.get(mode.tdoc.domainId, pid);
            const statements = await problem.getStatements(pdoc);
            if (statements.some((s) => String(s.content || '').includes(path))) return true;
        }
    }
    return false;
}

export function installMode(ctx: Context, assetVersion: string) {
    class ArenaModeStatusHandler extends Handler {
        noCheckPermView = true;

        async get() {
            const mode = await modeFor(this.user._id);
            this.response.addHeader('Cache-Control', 'private, no-store');
            this.response.addHeader('Vary', 'Cookie');
            this.response.body = { active: !!mode?.active, redirect: mode?.active ? mode.redirect : '', startsAt: mode?.startsAt || null, now: Date.now() };
        }
    }
    ctx.Route('arena_mode_status', '/arena-mode/status', ArenaModeStatusHandler);
    ctx.inject(['server'], (c) => {
        c.server.addHandlerLayer('arena_account_mode', async (context: any, next) => {
            const currentUid = context.HydroContext.user?._id;
            const mode = await modeFor(currentUid);
            if (mode) {
                context.set('Cache-Control', 'private, no-store');
                context.vary('Cookie');
                context.HydroContext.arenaAccountMode = mode;
                if (mode.active && !await permitted(context, mode)) {
                    // The outer framework renderer requires a handler and owns the response.
                    context.handler = new Handler(context, c);
                    Object.assign(context.HydroContext.response, {
                        status: 303, type: 'application/json', template: null,
                        body: JSON.stringify({ url: mode.redirect }),
                    });
                    context.set('Location', mode.redirect);
                    return;
                }
            }
            await next();
            // Login and OAuth establish the new identity during the handler.
            if (context.session?.uid && context.session.uid !== currentUid) {
                const loggedIn = await modeFor(context.session.uid);
                if (loggedIn?.active) {
                    const response = context.HydroContext.response;
                    response.redirect = loggedIn.redirect;
                    response.template = null;
                    response.body = {};
                }
            }
        });
    });
    ctx.on('handler/create/ws', async (h) => {
        if ((await modeFor(h.context.HydroContext.user?._id))?.active) {
            // The framework pauses new sockets during authentication; resume to finish the close handshake.
            h.conn?.resume?.();
            throw new PermissionError(PERM.PERM_VIEW_CONTEST);
        }
    });
    ctx.on('connection/active', (h) => {
        const uid = h.context.HydroContext.user?._id;
        if (!uid || uid < 0) return;
        h.ctx.interval(async () => {
            try {
                const mode = await modeFor(uid);
                if (mode?.active) { h.send({ arenaRedirect: mode.redirect }); h.close(4003, 'Contest mode'); }
            } catch { h.close(4003, 'Contest mode check failed'); }
        }, 5000);
    });
    ctx.on('handler/after', (handler) => {
        if (handler.user?._id > 0 && handler.response?.template) {
            handler.response.body.arenaModeWatch = `/arena-assets/${assetVersion}/mode-guard.js`;
        }
    });
    ctx.on('contest/del', async (domainId, tid) => {
        await Promise.all([modes.deleteMany({ domainId, contest: tid }), imports.deleteMany({ domainId, contest: tid })]);
    });
}
