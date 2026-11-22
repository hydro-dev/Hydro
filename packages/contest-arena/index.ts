/* eslint-disable no-await-in-loop -- Scoreboard row statistics and jury updates depend on ordered processing. */
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import {
    avatar,
    ContestModel as contest,
    Context,
    db,
    DomainModel as domain,
    Handler,
    NotFoundError,
    ObjectId,
    PERM,
    PermissionError,
    PRIV,
    ProblemModel as problem,
    RecordModel as record,
    SettingModel,
    UserModel as user,
    ValidationError,
} from 'hydrooj';
import { ContestDetailBaseHandler } from 'hydrooj/src/handler/contest';
import { administrator } from './enrollment';
import { installMode } from './mode';
import { installParticipantManagement } from './participants';
import { contestTime, juryAnswered } from './presentation';
import { allowedLanguageIds, problemLimits } from './problem';
import { resolverFreeze } from './resolver';
import { createResolverPackage } from './resolver-package';
import { avatarImage, badgeTextColor, medalCounts, medalFor, problemColors, summarize } from './scoreboard';
import { finalizedSnapshot, pendingStatuses, ranked, ratingReady, score, stats, verdicts } from './scoring';

export const name = 'contest-arena';
const RULE = 'icpc_domjudge';
const files = Object.fromEntries(
    ['arena.css', 'arena.js', 'participants.css', 'participants.js', 'mode-guard.js', 'contest.css'].map((file) => [
        file,
        readFileSync(join(__dirname, 'frontend', file)),
    ]),
);
files['arena.css'] = Buffer.concat([
    files['arena.css'],
    readFileSync(join(__dirname, 'frontend', 'presentation.css')),
    readFileSync(join(__dirname, 'frontend', 'scoreboard.css')),
]);
files['arena.js'] = Buffer.concat([files['arena.js'], readFileSync(join(__dirname, 'frontend', 'scoreboard.js'))]);
const katexRoot = dirname(require.resolve('katex/dist/katex.min.css'));
files['katex.css'] = readFileSync(join(katexRoot, 'katex.min.css'));
files['hgnu-logo.png'] = readFileSync(join(__dirname, 'frontend', 'hgnu-logo.png'));
const fontFiles = new Set(
    readdirSync(join(katexRoot, 'fonts')).filter((file) => /^KaTeX_[\w-]+\.(?:woff2?|ttf)$/.test(file)),
);
const assetVersion = Object.keys(files)
    .sort()
    .reduce((hash, file) => hash.update(file).update(files[file]), createHash('sha256'))
    .digest('hex')
    .slice(0, 16);
const views = new Set([
    'home',
    'problems',
    'problem',
    'submit',
    'submission',
    'scoreboard',
    'clarifications',
    'clarification',
    'languages',
    'jury',
]);
const alphabet = (index: number) => String.fromCharCode(65 + index);
const hex = (id: any) => id?.toHexString?.() || String(id || '');
const enabled = (tdoc: any) => tdoc.rule === RULE;
const sha = (value: any) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function buildRows(tdoc: any, tsdocs: any[], frozen: boolean) {
    return ranked(
        tsdocs
            .filter((row) => row.attend)
            .map((row) => ({
                ...row,
                ...score(tdoc, row.journal || [], frozen ? tdoc.lockAt : undefined),
            })),
    );
}

function installRule(ctx: Context) {
    const base = contest.RULES.acm;
    const rule = contest.buildContestRule(
        {
            TEXT: '现场赛',
            statusSort: { accept: -1, time: 1, lastAccepted: 1 },
            submitAfterAccept: true,
            check(tdoc) {
                if (tdoc.duration) throw new ValidationError('现场训练使用统一开赛时间，请关闭弹性赛时');
                if (
                    tdoc.lockAt
                    && (!Number.isFinite(+tdoc.lockAt) || +tdoc.lockAt < +tdoc.beginAt || +tdoc.lockAt >= +tdoc.endAt)
                ) {
                    throw new ValidationError('封榜时间必须在比赛开始至结束之间');
                }
            },
            stat: stats,
            async ratingReady(tdoc, now) {
                // Cancelled journals identify archived submissions when an account changes teams.
                const rows = await contest
                    .getMultiStatus(tdoc.domainId, {
                        docId: tdoc.docId,
                        registrationCancelled: { $in: [true, false, null] },
                    })
                    .project({ uid: 1, members: 1, attend: 1, registrationCancelled: 1, unrank: 1, journal: 1 })
                    .toArray();
                if (!ratingReady(tdoc, rows, +now)) return false;
                const records = await record
                    .getMulti(tdoc.domainId, { contest: tdoc.docId })
                    .project({ _id: 1, uid: 1, pid: 1, status: 1 })
                    .toArray();
                return finalizedSnapshot(tdoc, rows, records);
            },
            async ranked(tdoc, cursor) {
                return buildRows(tdoc, await cursor.toArray(), contest.isLocked(tdoc))
                    .filter((row) => !row.unrank)
                    .map((row) => [row.rank === '*' ? 0 : row.rank, row]);
            },
            async scoreboard(config, translate, tdoc, pdict, cursor) {
                config = { ...config, lockAt: contest.isLocked(tdoc) ? config.lockAt : null };
                const rows = buildRows(tdoc, await cursor.toArray(), !!config.lockAt);
                const ids = rows.flatMap((row) => [row.uid, ...(row.members || [])]);
                const udict = await user.getListForRender(tdoc.domainId, ids, config.showDisplayName);
                for (const row of rows) {
                    if (row.members?.length && udict[row.uid]) (udict[row.uid] as any).teamMembers = row.members;
                }
                const first = {};
                for (const row of rows) {
                    for (const [pid, cell] of Object.entries<any>(row.detail)) {
                        if (cell.status === 1) first[pid] = Math.min(first[pid] ?? Infinity, +cell.rid.getTimestamp());
                    }
                }
                const header = await base.scoreboardHeader(config, translate, tdoc, pdict);
                const body = [];
                for (const row of rows) {
                    // The inherited row renderer also updates per-problem summary counts.
                    // Keep its journal on the same inclusive freeze boundary as the cells.
                    const journal = (row.journal || []).filter((entry) => {
                        const stamp = +entry.rid.getTimestamp();
                        return stamp >= +tdoc.beginAt && stamp < +tdoc.endAt && (!config.lockAt || stamp < +config.lockAt);
                    });
                    body.push(
                        await base.scoreboardRow(
                            config,
                            translate,
                            tdoc,
                            pdict,
                            udict[row.uid],
                            row.rank === '*' ? 0 : row.rank,
                            { ...row, journal, display: row.detail },
                            { first },
                        ),
                    );
                }
                return [[header, ...body], udict];
            },
            applyProjection(tdoc, rdoc) {
                if (contest.isDone(tdoc)) return rdoc;
                const safe = { ...rdoc, testCases: [], judgeTexts: [], subtasks: {} };
                for (const field of ['time', 'memory', 'progress', 'score']) delete safe[field];
                return safe;
            },
        } as any,
        base,
    );
    ctx.effect(() => {
        if (contest.RULES[RULE]) throw new Error('Duplicate arena rule');
        contest.RULES[RULE] = rule;
        return () => {
            delete contest.RULES[RULE];
        };
    });
}

class ArenaAssetHandler extends Handler {
    noCheckPermView = true;

    get() {
        const file = this.request.params.file;
        const font = this.request.path.includes('/fonts/');
        const logo = file === 'hgnu-logo.png' && this.request.params.version === 'logo';
        if (
            (!logo && this.request.params.version !== assetVersion)
            || (font ? !fontFiles.has(file) : !Object.hasOwn(files, file))
        ) { throw new NotFoundError(); }
        this.response.type = font
            ? file.endsWith('.woff2')
                ? 'font/woff2'
                : file.endsWith('.woff')
                    ? 'font/woff'
                    : 'font/ttf'
            : file.endsWith('.png')
                ? 'image/png'
                : file.endsWith('.css')
                    ? 'text/css'
                    : 'application/javascript';
        this.response.addHeader('Cache-Control', logo ? 'public, max-age=3600' : 'public, max-age=31536000, immutable');
        this.response.body = font ? readFileSync(join(katexRoot, 'fonts', file)) : files[file];
    }
}

class ArenaBaseHandler extends ContestDetailBaseHandler {
    get domainId() {
        return this.domain._id;
    }

    get tid() {
        return this.tdoc.docId;
    }

    get mine() {
        return this.team ?? this.user._id;
    }

    get jury() {
        return administrator(this.user, this.tdoc);
    }

    get running() {
        return contest.isOngoing(this.tdoc, this.tsdoc);
    }

    async __prepare() {
        // Bind scope to the actual route, independently of form/query fields.
        this.args.domainId = this.domainId;
        const id = this.request.params.tid;
        if (!ObjectId.isValid(id)) throw new NotFoundError('比赛');
        await super.__prepare(this.domainId, new ObjectId(id));
        this.args.tid = this.tid;
    }

    async prepare() {
        if (!enabled(this.tdoc)) throw new NotFoundError('现场比赛模式');
        this.checkPerm(PERM.PERM_VIEW_CONTEST);
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.addHeader('Vary', 'Cookie, Authorization');
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        this.session.arenaCsrf ||= randomBytes(24).toString('hex');
        if (this.request.method.toLowerCase() === 'post') {
            const received = Buffer.from(String(this.request.body.csrf || ''));
            const expected = Buffer.from(this.session.arenaCsrf);
            if (received.length !== expected.length || !timingSafeEqual(received, expected)) { throw new ValidationError('页面已过期，请刷新后重试'); }
        }
    }

    async after() {
        /* The arena has a separate layout and navigation. */
    }

    link(view = 'home', query: Record<string, string | number> = {}) {
        const base = this.url('arena_home', { tid: this.tid });
        const path = view === 'home' ? base : `${base}/${view}`;
        const search = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
        return path + (search.size ? `?${search}` : '');
    }

    requireParticipant() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        if (!this.tsdoc?.attend) throw new PermissionError(PERM.PERM_ATTEND_CONTEST);
    }

    requireJury() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        if (!this.jury) throw new PermissionError(PERM.PERM_EDIT_CONTEST);
    }

    requireLive() {
        this.requireParticipant();
        if (!this.running) throw new ValidationError('比赛未开始或已结束');
    }

    async data(view: string) {
        const before = contest.isNotStarted(this.tdoc);
        const ended = contest.isDone(this.tdoc);
        const participantEnded = contest.isDone(this.tdoc, this.tsdoc);
        const frozen = contest.isLocked(this.tdoc);
        const realtime = view === 'jury' || this.request.query.realtime === '1';
        if (realtime) this.requireJury();
        if (view === 'jury') this.requireJury();
        if (view === 'submit' || (view === 'submission' && !this.jury) || (view === 'problem' && !ended && !this.jury)) { this.requireParticipant(); }
        if (before && !this.jury && ['problem', 'problems', 'submit', 'submission', 'scoreboard'].includes(view)) {
            throw new ValidationError('比赛尚未开始');
        }
        if (!before && !ended && !this.tsdoc?.attend && !this.jury && !['home', 'scoreboard', 'languages'].includes(view)) {
            throw new PermissionError(PERM.PERM_ATTEND_CONTEST);
        }
        if (view === 'scoreboard') {
            this.checkPerm(PERM.PERM_VIEW_CONTEST_SCOREBOARD);
            if (!contest.canShowScoreboard.call(this, this.tdoc) || (this.tdoc.keepScoreboardHidden && !this.jury)) {
                throw new PermissionError(PERM.PERM_VIEW_CONTEST_SCOREBOARD);
            }
        }
        if (this.tsdoc?.attend && !this.tsdoc.startAt && this.running) {
            await contest.setStatus(this.domainId, this.tid, this.mine, { startAt: new Date() });
        }
        const canProblems = (!before || this.jury) && (!!this.tsdoc?.attend || ended || this.jury);
        const ownFilter = {
            contest: this.tid,
            uid: this.tsdoc?.members?.length ? { $in: this.tsdoc.members } : this.user._id,
        };
        const requestedPage = Number(this.request.query.page || 1);
        if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > 1000000) { throw new ValidationError('page'); }
        const recordTotal = this.tsdoc?.attend && view === 'home' ? await record.count(this.domainId, ownFilter) : 0;
        const recordPages = Math.max(1, Math.ceil(recordTotal / 50));
        const recordPage = Math.min(requestedPage, recordPages);
        const [tsdocs, pdict, ownRecords, clarifications] = await Promise.all([
            contest.getMultiStatus(this.domainId, { docId: this.tid }).toArray(),
            canProblems ? problem.getList(this.domainId, this.tdoc.pids, true, true, problem.PROJECTION_CONTEST_DETAIL) : {},
            this.tsdoc?.attend && view === 'home'
                ? record
                    .getMulti(this.domainId, ownFilter)
                    .project({ _id: 1, pid: 1, lang: 1, status: 1, 'migration.submissionId': 1 })
                    .sort({ _id: -1 })
                    .skip((recordPage - 1) * 50)
                    .limit(50)
                    .toArray()
                : [],
            this.tsdoc?.attend || this.jury
                ? contest.getMultiClarification(
                    this.domainId,
                    this.tid,
                    view === 'jury' ? undefined : this.tsdoc?.members?.length ? this.tsdoc.members : this.user._id,
                )
                : [],
        ]);
        const ids = [
            ...new Set([
                ...tsdocs.flatMap((row) => [row.uid, ...(row.members || [])]),
                ...clarifications
                    .flatMap((item) => [item.owner, ...(item.reply || []).map((reply) => reply.owner)])
                    .filter((uid) => uid > 0),
            ]),
        ];
        const udict = await user.getListForRender(this.domainId, ids, false);
        const colors = problemColors;
        const medals = medalCounts(this.tdoc.medals);
        const splitLangs = (value?: string) =>
            value?.trim()
                ? value
                    .split(',')
                    .map((key) => key.trim())
                    .filter(Boolean)
                : undefined;
        const referenceDomains = Object.fromEntries(
            await Promise.all(
                [
                    ...new Set(
                        Object.values(pdict)
                            .map((pdoc: any) => pdoc.reference?.domainId)
                            .filter(Boolean),
                    ),
                ].map(async (id) => [id, await domain.get(id)]),
            ),
        );
        const referenceProblems = Object.fromEntries(
            await Promise.all(
                Object.values(pdict)
                    .filter((pdoc: any) => pdoc.reference)
                    .map(async (pdoc: any) => [pdoc.docId, await problem.get(pdoc.reference.domainId, pdoc.reference.pid)]),
            ),
        );
        const problems = canProblems
            ? this.tdoc.pids.map((pid, index) => {
                const pdoc = pdict[pid];
                const filePdoc = pdoc.reference ? referenceProblems[pid] : pdoc;
                const config = typeof pdoc.config === 'object' ? pdoc.config : {};
                const configured = this.tdoc.balloon?.[pid];
                const color = typeof configured === 'string' ? configured : configured?.color;
                return {
                    pid,
                    label: alphabet(index),
                    title: pdoc.title,
                    color: /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color || '') ? color : colors[index % colors.length],
                    textColor: badgeTextColor(
                        /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color || '') ? color : colors[index % colors.length],
                    ),
                    ...problemLimits(config),
                    type:
                          config.type === 'interactive' || config.interactor
                              ? 'Interactive'
                              : config.type === 'submit_answer'
                                  ? 'Output only'
                                  : 'Pass-fail',
                    languages: allowedLanguageIds(
                        SettingModel.langs,
                        config.langs,
                        this.tdoc.langs?.length ? this.tdoc.langs : undefined,
                        splitLangs(this.domain.langs),
                        pdoc.reference ? splitLangs(referenceDomains[pdoc.reference.domainId]?.langs) : undefined,
                    ),
                    url: this.link('problem', { pid }),
                    submit: this.link('submit', { pid }),
                    files: (filePdoc?.additional_file || []).map((file, fileIndex) => ({
                        name: file.name,
                        label: /\.(?:png|jpe?g|gif|webp|svg)$/i.test(file.name)
                            ? `Image ${fileIndex + 1} (.${file.name.split('.').at(-1).toUpperCase()})`
                            : /^[\w-]{16,}\.\w+$/.test(file.name)
                                ? `Attachment ${fileIndex + 1} (.${file.name.split('.').at(-1)})`
                                : file.name,
                        url: this.url('problem_file_download', {
                            pid,
                            filename: file.name,
                            type: 'additional_file',
                            query: { tid: this.tid },
                        }),
                    })),
                    submitUrl: this.url('problem_submit', { pid, query: { tid: this.tid } }),
                };
            })
            : !before && view === 'scoreboard'
                ? this.tdoc.pids.map((pid, index) => {
                    // Public standings need columns, without granting access to statements or files.
                    const configured = this.tdoc.balloon?.[pid];
                    const rawColor = typeof configured === 'string' ? configured : configured?.color;
                    const color = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(rawColor || '')
                        ? rawColor
                        : colors[index % colors.length];
                    return {
                        pid,
                        label: alphabet(index),
                        title: '',
                        color,
                        textColor: badgeTextColor(color),
                        languages: [],
                        files: [],
                        url: '',
                        submit: '',
                        submitUrl: '',
                        type: 'Pass-fail',
                    };
                })
                : [];
        const rankRows = buildRows(this.tdoc, tsdocs, frozen && !realtime);
        const first = {};
        for (const row of rankRows) {
            for (const [pid, cell] of Object.entries<any>(row.detail)) {
                if (cell.status === 1) first[pid] = Math.min(first[pid] ?? Infinity, +cell.rid.getTimestamp());
            }
        }
        const mapped = (row, own = false) => ({
            uid: row.uid,
            rank: own && frozen && !realtime ? '?' : row.rank,
            name:
                row.displayName
                || udict[row.uid]?.name
                || udict[row.uid]?.displayName
                || udict[row.uid]?.uname
                || `Team ${row.uid}`,
            organization:
                [
                    ...new Set(
                        (row.members?.length ? row.members : [row.uid]).map((uid) => udict[uid]?.class).filter(Boolean),
                    ),
                ].join(' / ') || '未填写班级',
            logo: avatarImage(
                udict[row.uid]?.avatar ? avatar(udict[row.uid].avatar, 64) : '',
                udict[row.uid]?.avatar?.startsWith('gravatar:'),
            ),
            avatar: true,
            category: row.unrank ? 'Unofficial' : 'Participants',
            medal: own && frozen && !realtime ? '' : medalFor(row, medals),
            members: (row.members || []).map((uid) => udict[uid]?.uname || String(uid)),
            solved: row.accept || 0,
            penalty: Math.floor((row.time || 0) / 60),
            mine: row.uid === this.mine,
            cells: problems.map((p) => {
                const cell = row.detail[p.pid] || {};
                const correct = cell.status === 1;
                const pending = cell.npending || 0;
                return {
                    correct,
                    pending,
                    attempts: cell.naccept || 0,
                    submissions: (cell.naccept || 0) + Number(correct),
                    time: correct ? Math.floor(cell.real / 60) : null,
                    first: correct && +cell.rid.getTimestamp() === first[p.pid],
                    state: correct ? 'correct' : pending ? 'pending' : cell.naccept ? 'incorrect' : 'untried',
                    url: row.uid === this.mine && cell.rid ? this.link('submission', { rid: hex(cell.rid) }) : '',
                };
            }),
        });
        for (const p of problems) {
            (p as any).attachments = p.files.filter((file) => !/\.(?:png|jpe?g|gif|webp|svg)$/i.test(file.name));
        }
        const self = buildRows(
            this.tdoc,
            tsdocs.filter((row) => row.uid === this.mine),
            false,
        )[0];
        const publicSelf = rankRows.find((row) => row.uid === this.mine);
        const visibleRecords = ownRecords.map((rdoc) => ({
            id: hex(rdoc._id),
            number: rdoc.migration?.submissionId || hex(rdoc._id).slice(-6),
            time: contestTime(rdoc._id.getTimestamp(), this.tdoc.beginAt),
            label: alphabet(this.tdoc.pids.indexOf(rdoc.pid)),
            title: pdict[rdoc.pid]?.title || '',
            language: SettingModel.langs[rdoc.lang]?.display || rdoc.lang,
            languageId: rdoc.lang,
            color: problems.find((p) => p.pid === rdoc.pid)?.color,
            textColor: problems.find((p) => p.pid === rdoc.pid)?.textColor,
            status: rdoc.status,
            verdict: verdicts[rdoc.status] || 'JUDGE-ERROR',
            pending: pendingStatuses.has(rdoc.status),
            url: this.link('submission', { rid: hex(rdoc._id) }),
        }));
        const digest = sha(clarifications.map((item) => [hex(item.docId), item.content, item.reply]));
        const participantNames = new Map<number, string>();
        for (const row of tsdocs) {
            const participantName =
                row.displayName
                || udict[row.uid]?.name
                || udict[row.uid]?.displayName
                || udict[row.uid]?.uname
                || `Team ${row.uid}`;
            for (const uid of [row.uid, ...(row.members || [])]) participantNames.set(uid, participantName);
        }
        const senderName = (uid: number) =>
            uid === 0 ? 'Jury' : participantNames.get(uid) || udict[uid]?.name || udict[uid]?.uname || `Team ${uid}`;
        const seen = this.session.arenaSeen || {};
        const unread = clarifications.length && seen[hex(this.tid)] !== digest ? clarifications.length : 0;
        const clars = clarifications.map((item) => ({
            id: hex(item.docId),
            broadcast: item.owner === 0,
            from: senderName(item.owner),
            subject: item.subject
                ? `${alphabet(this.tdoc.pids.indexOf(item.subject))} - ${pdict[item.subject]?.title || 'Problem'}`
                : 'General',
            subjectLabel: item.subject ? alphabet(this.tdoc.pids.indexOf(item.subject)) : '',
            content: item.content,
            summary: String(item.content).replace(/\s+/g, ' ').slice(0, 110),
            replies: (item.reply || []).map((reply) => ({
                content: reply.content,
                owner: reply.owner,
                from: senderName(reply.owner),
                time: contestTime(reply._id.getTimestamp(), this.tdoc.beginAt),
            })),
            answered: juryAnswered(item.reply),
            time: contestTime(item.docId.getTimestamp(), this.tdoc.beginAt),
            url: this.link('clarification', { did: hex(item.docId) }),
        }));
        const languageKeys = canProblems
            ? [...new Set(problems.flatMap((p) => p.languages))]
            : allowedLanguageIds(
                SettingModel.langs,
                this.tdoc.langs?.length ? this.tdoc.langs : undefined,
                splitLangs(this.domain.langs),
            );
        const arena: any = {
            view,
            title: this.tdoc.title,
            tid: hex(this.tid),
            before,
            ended,
            participantEnded,
            frozen,
            start: +this.tdoc.beginAt,
            end: +this.tdoc.endAt,
            now: Date.now(),
            startText: this.formatTime(this.tdoc.beginAt),
            endText: this.formatTime(this.tdoc.endAt),
            updatedText: this.formatTime(new Date()),
            jury: this.jury,
            realtime,
            participant: !!this.tsdoc?.attend,
            canRejudge: this.jury && this.user.hasPerm(PERM.PERM_REJUDGE),
            restrictExit: !!(this.context.HydroContext as any).arenaAccountMode?.active && !this.jury,
            publicInterface: !this.tsdoc?.attend && !realtime,
            medals,
            hasMedals: Object.values(medals).some(Boolean),
            canSubmit: !!this.tsdoc?.attend && this.running,
            username: this.user.uname,
            csrf: this.session.arenaCsrf,
            participantName: self ? mapped(self, true).name : this.user.name || this.user.uname,
            css: `/arena-assets/${assetVersion}/arena.css`,
            js: `/arena-assets/${assetVersion}/arena.js`,
            katex: `/arena-assets/${assetVersion}/katex.css`,
            links: Object.fromEntries([...views, 'state'].map((v) => [v, this.link(v)])),
            oj: this.url('contest_detail', { tid: this.tid }),
            ojScoreboard: this.url('contest_scoreboard', { tid: this.tid }),
            edit: this.url('contest_edit', { tid: this.tid }),
            manage: this.url('contest_manage', { tid: this.tid }),
            login: this.url('user_login', { query: { redirect: this.link() } }),
            problems,
            rows: rankRows.map((row) => mapped(row)),
            own: self ? mapped({ ...self, rank: publicSelf?.rank ?? '-' }, true) : null,
            records: visibleRecords,
            unread,
            clars,
            recordPage,
            recordPages,
            recordTotal,
            recordPrevious: recordPage > 1 ? this.link('home', { page: recordPage - 1 }) : '',
            recordNext: recordPage < recordPages ? this.link('home', { page: recordPage + 1 }) : '',
            broadcasts: clars.flatMap((item) =>
                item.broadcast
                    ? [item]
                    : item.replies
                        .filter((reply) => reply.owner === 0)
                        .map((reply) => ({
                            ...item,
                            from: 'Jury',
                            content: reply.content,
                            summary: String(reply.content).replace(/\s+/g, ' ').slice(0, 110),
                            time: reply.time,
                        })),
            ),
            requests: clars.filter((item) => !item.broadcast),
            preferredLanguage: this.user.codeLang || 'cc.cc20',
            languages: languageKeys.map((id) => ({
                id,
                name: SettingModel.langs[id].display || id,
                extension: SettingModel.langs[id].code_file?.split('.').at(-1) || '',
            })),
        };
        const submitted = visibleRecords.find((item) => item.id === this.request.query.submitted);
        arena.submitted = submitted?.url || '';
        if (view === 'clarification') {
            arena.clarification = clars.find((item) => item.id === this.request.query.did);
            if (!arena.clarification) throw new NotFoundError('答疑');
        }
        let previousRank: number | string;
        for (const row of arena.rows) {
            row.rankLabel = row.rank === previousRank && row.rank !== '*' ? '' : row.rank;
            previousRank = row.rank;
        }
        arena.hasLogos = arena.rows.some((row) => row.logo) || !!arena.own?.logo;
        arena.summary = summarize(arena.rows, problems.length);
        arena.totalSolved = arena.summary.reduce((sum, item) => sum + item.solved, 0);
        arena.affiliations = [...new Set(arena.rows.map((row) => row.organization).filter(Boolean))].sort();
        arena.categories = [...new Set(arena.rows.map((row) => row.category))];
        arena.freezeRemaining = this.tdoc.lockAt
            ? Math.max(0, Math.ceil((+this.tdoc.endAt - +this.tdoc.lockAt) / 60000))
            : 0;
        arena.resolverExport = ended && this.jury ? this.url('arena_resolver_export', { tid: this.tid }) : '';
        if (['problem', 'submit'].includes(view)) {
            const pid = Number(this.request.query.pid || problems[0]?.pid);
            if (!Number.isSafeInteger(pid) || !this.tdoc.pids.includes(pid) || !pdict[pid]) throw new NotFoundError('题目');
            arena.problem = problems.find((p) => p.pid === pid);
            if (view === 'problem') {
                arena.pdoc = pdict[pid];
                arena.statements = (await problem.getStatements(pdict[pid])).map((statement) => ({
                    ...statement,
                    content: statement.content?.replace(/file:\/\/([^ \n)\\"]+)/g, (value, attachmentName) => {
                        let filename = attachmentName.split('?')[0];
                        try {
                            filename = decodeURIComponent(filename);
                        } catch {
                            return value;
                        }
                        const file = arena.problem.files.find((item) => item.name === filename);
                        return file?.url || value;
                    }),
                }));
            }
        }
        if (view === 'submission') {
            const rawId = String(this.request.query.rid || '');
            if (!ObjectId.isValid(rawId)) throw new NotFoundError('提交');
            const rdoc = await record.get(this.domainId, new ObjectId(rawId));
            if (!rdoc || hex(rdoc.contest) !== hex(this.tid)) throw new NotFoundError('提交');
            const canView = rdoc.uid === this.user._id || this.tsdoc?.members?.includes(rdoc.uid);
            if (!canView && !this.jury) throw new PermissionError(PERM.PERM_READ_RECORD_CODE);
            arena.submission = {
                id: rawId,
                label: alphabet(this.tdoc.pids.indexOf(rdoc.pid)),
                title: pdict[rdoc.pid]?.title,
                code: rdoc.code || '',
                language: SettingModel.langs[rdoc.lang]?.display || rdoc.lang,
                verdict: verdicts[rdoc.status] || 'JUDGE-ERROR',
                status: rdoc.status,
                pending: pendingStatuses.has(rdoc.status),
                time: contestTime(rdoc._id.getTimestamp(), this.tdoc.beginAt),
                compiler: (rdoc.compilerTexts || [])
                    .map((value) => (typeof value === 'string' ? value : JSON.stringify(value)))
                    .join('\n'),
                download: this.url('record_detail', { rid: rdoc._id, query: { download: true } }),
                original: this.url('record_detail', { rid: rdoc._id }),
                rejudge: this.url('record_detail', { rid: rdoc._id }),
            };
        }
        if (view === 'jury') {
            arena.allRecords = (
                await record.getMulti(this.domainId, { contest: this.tid }).sort({ _id: -1 }).limit(100).toArray()
            ).map((rdoc) => ({
                id: hex(rdoc._id),
                team: udict[rdoc.uid]?.uname || String(rdoc.uid),
                label: alphabet(this.tdoc.pids.indexOf(rdoc.pid)),
                verdict: verdicts[rdoc.status] || 'JUDGE-ERROR',
                status: rdoc.status,
                url: this.link('submission', { rid: hex(rdoc._id) }),
            }));
            arena.balloons = (await contest.getMultiBalloon(this.domainId, this.tid).sort({ _id: 1 }).toArray()).map(
                (item) => ({
                    id: hex(item._id),
                    team: udict[item.uid]?.displayName || udict[item.uid]?.uname || String(item.uid),
                    label: alphabet(this.tdoc.pids.indexOf(item.pid)),
                    sent: !!item.sent,
                }),
            );
        }
        if (
            (before
                || this.tdoc.keepScoreboardHidden
                || !this.user.hasPerm(PERM.PERM_VIEW_CONTEST_SCOREBOARD)
                || !contest.canShowScoreboard.call(this, this.tdoc))
            && !this.jury
        ) {
            arena.rows = [];
            arena.summary = [];
            arena.totalSolved = 0;
            arena.affiliations = [];
            arena.categories = [];
            arena.hasLogos = false;
            if (arena.own) arena.own.rank = '?';
            if (before) {
                arena.own = null;
                arena.records = [];
            }
        }
        return { arena, clarificationDigest: digest };
    }

    formatTime(date: Date) {
        return new Intl.DateTimeFormat('sv-SE', {
            timeZone: this.user.timeZone || 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        }).format(date);
    }
}

class ArenaPageHandler extends ArenaBaseHandler {
    async get() {
        const view = this.request.params.view || 'home';
        if (!views.has(view)) throw new NotFoundError();
        const { arena, clarificationDigest } = await this.data(view);
        if (view === 'problem') {
            arena.statementHtml = String(await this.renderHTML('arena/problem-statement.html', { arena }));
            delete arena.pdoc;
            delete arena.statements;
        }
        if (['home', 'clarifications', 'clarification'].includes(view) && this.tsdoc?.attend) {
            this.session.arenaSeen = { ...(this.session.arenaSeen || {}), [hex(this.tid)]: clarificationDigest };
            arena.unread = 0;
        }
        if (this.request.query.modal === '1' && ['submission', 'clarification'].includes(view)) {
            this.response.body = {
                title: view === 'submission' ? 'Submission details' : 'Clarification',
                html: String(await this.renderHTML(`arena/${view}-details.html`, { arena })),
            };
            return;
        }
        this.response.template = 'arena_page.html';
        this.response.body = { arena };
    }

    async post() {
        if (this.args.operation) return;
        throw new ValidationError('操作');
    }

    async postClarification() {
        this.requireLive();
        const content = String(this.request.body.content || '').trim();
        const subject = Number(this.request.body.subject || 0);
        if (
            !content
            || content.length > 10000
            || !Number.isSafeInteger(subject)
            || (subject && !this.tdoc.pids.includes(subject))
        ) { throw new ValidationError('答疑内容或题目'); }
        await this.limitRate('arena_clarification', 3600, 30);
        await contest.addClarification(this.domainId, this.tid, this.user._id, content, this.request.ip, subject);
        this.response.redirect = this.link('clarifications');
        this.response.body = { ok: true, redirect: this.link('clarifications') };
    }

    async postFollowup() {
        this.requireLive();
        const did = String(this.request.body.did || '');
        const content = String(this.request.body.content || '').trim();
        if (!ObjectId.isValid(did) || !content || content.length > 10000) throw new ValidationError('答疑内容');
        const item = await contest.getClarification(this.domainId, new ObjectId(did));
        const owners = this.tsdoc?.members?.length ? this.tsdoc.members : [this.user._id];
        if (!item || hex(item.parentId) !== hex(this.tid) || !owners.includes(item.owner)) { throw new PermissionError(PERM.PERM_ATTEND_CONTEST); }
        await this.limitRate('arena_clarification', 3600, 30);
        await contest.addClarificationReply(this.domainId, item.docId, this.user._id, content, this.request.ip);
        const redirect = this.link('clarification', { did });
        this.response.body = { ok: true, redirect };
    }

    async postPreview() {
        this.requireParticipant();
        const content = String(this.request.body.content || '');
        if (content.length > 10000) throw new ValidationError('答疑内容');
        this.response.body = { html: String(await this.renderHTML('arena/markdown-preview.html', { content })) };
    }

    async postReply() {
        this.requireJury();
        const content = String(this.request.body.content || '').trim();
        if (!content || content.length > 10000) throw new ValidationError('回复内容');
        const did = String(this.request.body.did || '');
        if (did) {
            if (!ObjectId.isValid(did)) throw new NotFoundError();
            const clarification = await contest.getClarification(this.domainId, new ObjectId(did));
            if (!clarification || hex(clarification.parentId) !== hex(this.tid)) throw new NotFoundError();
            await contest.addClarificationReply(this.domainId, new ObjectId(did), 0, content, this.request.ip);
        } else {
            const subject = Number(this.request.body.subject || 0);
            if (!Number.isSafeInteger(subject) || (subject && !this.tdoc.pids.includes(subject))) { throw new ValidationError('题目'); }
            await contest.addClarification(this.domainId, this.tid, 0, content, this.request.ip, subject);
        }
        this.response.redirect = this.link('jury');
        this.response.body = { ok: true, redirect: this.link('jury') };
    }

    async postBalloon() {
        this.requireJury();
        const id = String(this.request.body.id || '');
        if (!ObjectId.isValid(id) || !(await contest.getBalloon(this.domainId, this.tid, new ObjectId(id)))) { throw new NotFoundError(); }
        await contest.updateBalloon(this.domainId, this.tid, new ObjectId(id), { sent: true });
        this.response.redirect = this.link('jury');
        this.response.body = { ok: true, redirect: this.link('jury') };
    }

    async postUnlock() {
        this.requireJury();
        if (!contest.isDone(this.tdoc)) throw new ValidationError('比赛结束后才能解封榜单');
        await contest.unlockScoreboard(this.domainId, this.tid);
        this.response.redirect = this.link('scoreboard');
        this.response.body = { ok: true, redirect: this.link('scoreboard') };
    }

    async postPrint() {
        throw new NotFoundError('打印功能');
    }
}

class ArenaResolverExportHandler extends ArenaBaseHandler {
    async get() {
        this.requireJury();
        if (!contest.isDone(this.tdoc)) throw new ValidationError('比赛结束后才能导出滚榜包');
        try {
            const freeze = resolverFreeze(this.tdoc, this.request.query.freezeMinutes);
            if (this.request.query.download === '1') {
                const result = await createResolverPackage(this.tdoc, this.request.query.freezeMinutes);
                this.binary(result.bytes, `${this.tid}-icpc-resolver.zip`);
            } else {
                this.response.template = 'arena_resolver_export.html';
                this.response.body = {
                    tdoc: this.tdoc,
                    resolver: {
                        url: this.url('arena_resolver_export', { tid: this.tid }),
                        replay: freeze.replay,
                        minutes: freeze.minutes,
                        maximum: (+this.tdoc.endAt - +this.tdoc.beginAt) / 60000,
                        freezeText: freeze.freezeAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
                        medals: medalCounts(this.tdoc.medals),
                    },
                };
            }
        } catch (error) {
            if (error instanceof ValidationError) throw error;
            throw new ValidationError(error.message || '滚榜包生成失败，请稍后重试');
        }
    }
}

class ArenaStateHandler extends ArenaBaseHandler {
    async get() {
        const view = String(this.request.query.view || 'home');
        if (!views.has(view)) throw new NotFoundError();
        const { arena } = await this.data(view);
        const fragments: Record<string, string> = {};
        const names =
            view === 'home'
                ? ['own', 'records', 'clarifications']
                : view === 'scoreboard'
                    ? ['scoreboard', 'scoreboard-status']
                    : view === 'submission'
                        ? ['submission-status']
                        : view === 'clarifications'
                            ? ['clarifications']
                            : view === 'clarification'
                                ? ['clarification-details']
                                : view === 'jury'
                                    ? ['jury-requests', 'jury-balloons', 'jury-scoreboard', 'jury-records']
                                    : [];
        for (const key of names) fragments[key] = String(await this.renderHTML(`arena/${key}.html`, { arena }));
        this.response.body = {
            fragments,
            now: arena.now,
            start: arena.start,
            end: arena.end,
            before: arena.before,
            ended: arena.ended,
            participantEnded: arena.participantEnded,
            frozen: arena.frozen,
            unread: arena.unread,
            restrictExit: arena.restrictExit,
        };
    }
}

export function apply(ctx: Context) {
    installRule(ctx);
    installMode(ctx, assetVersion);
    installParticipantManagement(ctx, assetVersion);
    ctx.Route('arena_asset', '/arena-assets/:version/:file', ArenaAssetHandler);
    ctx.Route('arena_font', '/arena-assets/:version/fonts/:file', ArenaAssetHandler);
    ctx.Route('arena_state', '/contest/:tid/arena/state', ArenaStateHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('arena_resolver_export', '/contest/:tid/arena/resolver', ArenaResolverExportHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('arena_home', '/contest/:tid/arena', ArenaPageHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('arena_view', '/contest/:tid/arena/:view', ArenaPageHandler, PERM.PERM_VIEW_CONTEST);
    ctx.inject(['scoreboard'], ({ scoreboard }) => {
        scoreboard.addView(
            'icpc-resolver',
            '导出 ICPC 滚榜包',
            { tdoc: 'tdoc' },
            {
                async display({ tdoc }) {
                    if (!enabled(tdoc)) throw new NotFoundError('现场比赛模式');
                    if (!administrator(this.user, tdoc)) throw new PermissionError(PERM.PERM_EDIT_CONTEST);
                    if (!contest.isDone(tdoc)) throw new ValidationError('比赛结束后才能导出滚榜包');
                    this.response.redirect = this.url('arena_resolver_export', { tid: tdoc.docId });
                },
                checker() {
                    return contest.isDone(this.tdoc) && administrator(this.user, this.tdoc);
                },
                supportedRules: [RULE],
            },
        );
    });
    ctx.on('handler/after', (handler) => {
        if (handler.response?.template) {
            handler.response.body.arenaContestStyle = `/arena-assets/${assetVersion}/contest.css`;
        }
    });
    ctx.i18n.load('zh', {
        arena_home: '现场比赛',
        arena_view: '现场比赛',
        arena_resolver_export: '导出 ICPC 滚榜包',
        [RULE]: '现场赛',
    });
    ctx.on('app/started', async () => {
        await db.ensureIndexes(db.collection<any>('contest.arena.mode'), {
            name: 'contest_participant',
            key: { domainId: 1, contest: 1, participantUid: 1 },
        });
        await db.ensureIndexes(db.collection<any>('contest.arena.import'), {
            name: 'expires',
            key: { expiresAt: 1 },
            expireAfterSeconds: 0,
        });
        await db.ensureIndexes(
            db.collection<any>('document.status'),
            { name: 'arena_uid_attend', key: { docType: 1, uid: 1, attend: 1 } },
            { name: 'arena_member_attend', key: { docType: 1, members: 1, attend: 1 } },
        );
    });
}
