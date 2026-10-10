import { escapeRegExp } from 'lodash';
import {
    ContestModel, ContestNotFoundError, Context, difficultyAlgorithm, DiscussionModel,
    DiscussionNodeNotFoundError, DocumentModel, DomainModel, Handler, NotAssignedError,
    ObjectId, param, PERM, ProblemModel, RecordModel, SettingModel, STATUS, STATUS_CODES,
    STATUS_TEXTS, TrainingModel, Types, UserModel,
} from 'hydrooj';
import {
    activities, announcements, brand, communityTabs, contestTabs,
    countdowns, courseKinds, directions, paths, places, posts, wikiGroups,
} from './data';

function queryOf(handler: Handler, key: string) {
    const raw = handler.args[key];
    if (Array.isArray(raw)) return String(raw[0] || '');
    if (raw == null) return '';
    return String(raw);
}

function pick(raw: string, allowed: string[], fallback: string) {
    return allowed.includes(raw) ? raw : fallback;
}

function queryString(parts: Record<string, string | number | undefined>) {
    return Object.entries(parts)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
        .join('&');
}

function problemLevel(pdoc: { difficulty?: number, nSubmit?: number, nAccept?: number }) {
    if (pdoc.difficulty) return pdoc.difficulty;
    return difficultyAlgorithm(pdoc.nSubmit || 0, pdoc.nAccept || 0) || '';
}

function contestHours(tdoc: { duration?: number, beginAt?: Date, endAt?: Date }) {
    const raw = tdoc.duration
        ? Number(tdoc.duration)
        : (new Date(tdoc.endAt).getTime() - new Date(tdoc.beginAt).getTime()) / 3600000;
    if (!Number.isFinite(raw)) return '—';
    return (Math.round(raw * 10) / 10).toFixed(1);
}

function contestCard(tdoc: any) {
    const rule = ContestModel.RULES[tdoc.rule];
    return {
        id: tdoc.docId.toHexString(),
        title: tdoc.title,
        group: '—',
        hours: contestHours(tdoc),
        problems: Array.isArray(tdoc.pids) ? tdoc.pids.length : 0,
        people: tdoc.attend || 0,
        rule: rule ? rule.TEXT : '',
        access: tdoc._code ? '邀请码' : '公开',
        beginAt: tdoc.beginAt,
        endAt: tdoc.endAt,
    };
}

function memoryText(kb: number) {
    let s = kb * 1024;
    const unit = 1024;
    const names = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    for (const name of names) {
        if (s < unit) return `${Math.round(s * 10) / 10} ${name}`;
        s /= unit;
    }
    return `${Math.round(s * unit)} ${names[names.length - 1]}`;
}

function langChoices() {
    const langs = SettingModel.langs;
    const prefixes = new Set(
        Object.keys(langs).filter((key) => key.includes('.')).map((key) => key.split('.')[0]),
    );
    const choices = [];
    for (const key of Object.keys(langs)) {
        if (prefixes.has(key) || langs[key].hidden || langs[key].disabled) continue;
        choices.push({ id: key, display: langs[key].display });
    }
    return choices;
}

function courseOf(tdoc: any) {
    const dag = tdoc.dag || [];
    return {
        id: tdoc.docId.toHexString(),
        title: tdoc.title,
        brief: tdoc.content || '',
        chapters: dag.length,
        problems: TrainingModel.getPids(dag).length,
    };
}

class DtojPageHandler extends Handler {
    noCheckPermView = true;

    view(name: string, body: Record<string, any> = {}) {
        this.response.template = `${name}.html`;
        this.response.body = body;
    }
}

class DtojDataHandler extends DtojPageHandler {
    noCheckPermView = false;
}

class DtojHomeHandler extends DtojPageHandler {
    async get() {
        const u = this.user;
        const guest = !u || !u._id;
        const name = guest ? '示例同学' : String(u.uname || '示例同学');
        this.view('dtoj_home', {
            brand,
            coin: 256,
            streak: 6,
            who: name,
            mark: name.slice(0, 1),
            countdowns,
            activities,
            announcements,
            paths,
            wikiGroups,
        });
    }
}

class DtojTrainingHandler extends DtojDataHandler {
    @param('page', Types.PositiveInt, true)
    @param('q', Types.String, true)
    async get(domainId: string, page = 1, q = '') {
        const direction = pick(queryOf(this, 'direction'), directions, '');
        const kind = pick(queryOf(this, 'kind'), courseKinds, '');
        const query: any = {};
        if (q) query.title = { $regex: new RegExp(escapeRegExp(q), 'i') };
        await this.ctx.parallel('training/list', query, this);
        const hotDocs = await TrainingModel.getMulti(domainId, { ...query, pin: { $gt: 0 } }).toArray();
        const [tdocs, tpcount] = await this.paginate(
            TrainingModel.getMulti(domainId, { ...query, pin: { $not: { $gt: 0 } } }),
            page,
            'training',
        );
        this.view('dtoj_training', {
            directions,
            kinds: courseKinds,
            direction,
            kind,
            q,
            hot: hotDocs.map(courseOf),
            courses: tdocs.map(courseOf),
            page,
            pages: tpcount,
            qs: queryString({ q, direction, kind }),
        });
    }
}

class DtojTrainingDetailHandler extends DtojDataHandler {
    @param('tid', Types.ObjectId)
    async get(domainId: string, tid: ObjectId) {
        const tdoc = await TrainingModel.get(domainId, tid);
        const dag = tdoc.dag || [];
        this.view('dtoj_training_detail', {
            course: courseOf(tdoc),
            chapters: dag.map((node, index) => ({
                index: index + 1,
                title: node.title,
                pids: node.pids || [],
            })),
        });
    }
}

class DtojWikiHandler extends DtojPageHandler {
    async get() {
        this.view('dtoj_wiki', { groups: wikiGroups });
    }
}

class DtojWikiArticleHandler extends DtojPageHandler {
    async get() {
        const id = String(this.args.slug || '');
        let hit = { title: '占位文章', group: '知识库' };
        for (const group of wikiGroups) {
            const cell = group.cells.find((item) => item.id === id);
            if (cell) hit = { title: cell.title, group: group.title };
        }
        this.view('dtoj_wiki_article', hit);
    }
}

class DtojContestHandler extends DtojDataHandler {
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, page = 1) {
        const tab = pick(queryOf(this, 'tab'), contestTabs, contestTabs[0]);
        const groups = (await UserModel.listGroup(
            domainId,
            this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST) ? undefined : this.user._id,
        )).map((group) => group.name);
        const rules = Object.keys(ContestModel.RULES).filter((rule) => !ContestModel.RULES[rule].hidden);
        const filter: any = {
            ...(this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST)
                ? {}
                : {
                    $or: [
                        { maintainer: this.user._id },
                        { owner: this.user._id },
                        { assign: { $in: groups } },
                        { assign: { $size: 0 } },
                    ],
                }),
            rule: { $in: rules },
        };
        await this.ctx.parallel('contest/list', filter, this);
        const [tdocs, tpcount] = await this.paginate(
            ContestModel.getMulti(domainId, filter).sort({ endAt: -1, beginAt: -1, _id: -1 }),
            page,
            'contest',
        );
        const cards = tdocs.map(contestCard);
        this.view('dtoj_contest', {
            tabs: contestTabs,
            tab,
            featured: page === 1 ? cards[0] : undefined,
            contests: cards,
            page,
            pages: tpcount,
            qs: queryString({ tab }),
        });
    }
}

class DtojContestDetailHandler extends DtojDataHandler {
    @param('tid', Types.ObjectId)
    async get(domainId: string, tid: ObjectId) {
        const tdoc = await ContestModel.get(domainId, tid);
        if (!ContestModel.RULES[tdoc.rule] || ContestModel.RULES[tdoc.rule].hidden) {
            throw new ContestNotFoundError(domainId, tid);
        }
        if (tdoc.assign?.length && !this.user.own(tdoc) && !this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST)) {
            const groups = await UserModel.listGroup(domainId, this.user._id);
            if (!new Set(tdoc.assign).intersection(new Set(groups.map((group) => group.name))).size) {
                throw new NotAssignedError('contest', tid);
            }
        }
        this.view('dtoj_contest_detail', { contest: contestCard(tdoc) });
    }
}

class DtojRankHandler extends DtojDataHandler {
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, page = 1) {
        const [dudocs, upcount] = await this.paginate(
            DomainModel.getMultiUserInDomain(domainId, { uid: { $gt: 1 }, rp: { $gt: 0 }, join: true }).sort({ rp: -1 }),
            page,
            'ranking',
        );
        const udict = await UserModel.getList(domainId, dudocs.map((dudoc) => dudoc.uid));
        const rows = dudocs.map((dudoc) => {
            const udoc = udict[dudoc.uid];
            return {
                name: udoc?.uname || '—',
                now: Math.round(Number(udoc?.rp ?? dudoc.rp) || 0),
                best: '—',
            };
        });
        this.view('dtoj_rank', { rows, page, pages: upcount });
    }
}

class DtojRecordHandler extends DtojDataHandler {
    @param('page', Types.PositiveInt, true)
    @param('pid', Types.ProblemId, true)
    @param('uidOrName', Types.UidOrName, true)
    @param('lang', Types.String, true)
    @param('status', Types.Int, true)
    async get(
        domainId: string, page = 1, pid?: string | number,
        uidOrName?: string, lang?: string, status?: number,
    ) {
        // Public queue only. Contest records stay out; all=1 is not enabled.
        const q: any = { contest: null };
        let invalid = false;
        if (uidOrName) {
            const udoc = await UserModel.getById(domainId, +uidOrName)
                || await UserModel.getByUname(domainId, uidOrName)
                || await UserModel.getByEmail(domainId, uidOrName);
            if (udoc) q.uid = udoc._id;
            else invalid = true;
        }
        if (q.uid !== this.user._id) this.checkPerm(PERM.PERM_VIEW_RECORD);
        if (pid) {
            const pdoc = await ProblemModel.get(domainId, pid, ProblemModel.PROJECTION_LIST);
            if (pdoc) q.pid = pdoc.docId;
            else invalid = true;
        }
        if (lang) q.lang = lang;
        if (typeof status === 'number') q.status = status;
        const projection: Record<string, 1> = {};
        for (const key of RecordModel.PROJECTION_LIST) projection[key] = 1;
        const [rdocs, rpcount] = invalid
            ? [[], 0]
            : await this.paginate(
                RecordModel.getMulti(domainId, q).sort('_id', -1).project(projection),
                page,
                'record',
            );
        const canViewHidden = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id;
        const [udict, pdict] = await Promise.all([
            UserModel.getList(domainId, rdocs.map((rdoc) => rdoc.uid)),
            this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)
                ? ProblemModel.getList(domainId, rdocs.map((rdoc) => rdoc.pid), canViewHidden, false, ProblemModel.PROJECTION_LIST)
                : {},
        ]);
        const running = new Set([STATUS.STATUS_JUDGING, STATUS.STATUS_COMPILING, STATUS.STATUS_FETCHED]);
        const records = rdocs.map((rdoc) => {
            const pdoc = pdict[rdoc.pid];
            const visible = pdoc && pdoc.title && pdoc.title !== '*';
            return {
                id: rdoc._id,
                statusKey: STATUS_TEXTS[rdoc.status] || '',
                code: STATUS_CODES[rdoc.status] || '',
                progress: running.has(rdoc.status) && typeof rdoc.progress === 'number' ? rdoc.progress : null,
                score: typeof rdoc.score === 'number' ? rdoc.score : '—',
                time: rdoc.time ? `${Math.round(rdoc.time)}ms` : '—',
                memory: rdoc.memory ? memoryText(rdoc.memory) : '—',
                lang: SettingModel.langs[rdoc.lang]?.display || rdoc.lang || '—',
                problem: visible ? pdoc.title : '*',
                problemLink: visible ? (pdoc.pid || pdoc.docId) : '',
                user: udict[rdoc.uid]?.uname || '—',
            };
        });
        this.view('dtoj_record', {
            records,
            langs: langChoices(),
            statuses: Object.entries(STATUS_TEXTS).map(([id, text]) => ({ id, text })),
            uidOrName: uidOrName || '',
            pid: pid || '',
            lang: lang || '',
            status: typeof status === 'number' ? String(status) : '',
            page,
            pages: rpcount,
            qs: queryString({ uidOrName, pid, lang, status }),
        });
    }
}

class DtojCommunityHandler extends DtojPageHandler {
    async get() {
        const tab = pick(queryOf(this, 'tab'), communityTabs, communityTabs[0]);
        this.view('dtoj_community', { tabs: communityTabs, tab, posts });
    }
}

class DtojCommunityDetailHandler extends DtojPageHandler {
    async get() {
        const id = String(this.args.id || '');
        const post = posts.find((item) => item.id === id) || posts[0];
        this.view('dtoj_post', { post });
    }
}

class DtojDiscussHandler extends DtojDataHandler {
    @param('page', Types.PositiveInt, true)
    @param('node', Types.String, true)
    async get(domainId: string, page = 1, node = '') {
        const nodes = await DiscussionModel.getNodes(domainId);
        const groups: { category: string, nodes: { id: string }[] }[] = [];
        const grouped = new Map<string, { category: string, nodes: { id: string }[] }>();
        for (const item of nodes) {
            const category = String(item.content || '');
            let group = grouped.get(category);
            if (!group) {
                group = { category, nodes: [] };
                grouped.set(category, group);
                groups.push(group);
            }
            group.nodes.push({ id: String(item.docId) });
        }
        const known = {
            $in: [
                DocumentModel.TYPE_PROBLEM,
                DocumentModel.TYPE_CONTEST,
                DocumentModel.TYPE_DISCUSSION_NODE,
                DocumentModel.TYPE_TRAINING,
            ],
        };
        let query: any = { parentType: known, hidden: false };
        if (node) {
            const vnode = await DiscussionModel.getNode(domainId, node);
            if (!vnode) throw new DiscussionNodeNotFoundError(domainId, node);
            const hidden = this.user.own(vnode) || this.user.hasPerm(PERM.PERM_EDIT_DISCUSSION)
                ? {}
                : { hidden: false };
            query = {
                parentType: DocumentModel.TYPE_DISCUSSION_NODE,
                parentId: vnode.docId,
                ...hidden,
            };
        }
        const [ddocs, dpcount] = await this.paginate(
            DiscussionModel.getMulti(domainId, query).hint('discussionSort'),
            page,
            'discussion',
        );
        const [udict, vndict] = await Promise.all([
            UserModel.getList(domainId, ddocs.map((ddoc) => ddoc.owner)),
            DiscussionModel.getListVnodes(
                domainId, ddocs,
                this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN),
                this.user.group,
            ),
        ]);
        const threads = ddocs.map((ddoc) => {
            const bucket = vndict[ddoc.parentType] || {};
            const key = ddoc.parentId?.toString?.() || ddoc.parentId;
            const vnode = bucket[key] || bucket[ddoc.parentId];
            return {
                id: ddoc._id,
                title: ddoc.title,
                author: udict[ddoc.owner]?.uname || '—',
                time: ddoc.updateAt,
                node: vnode?.title || '—',
                replies: ddoc.nReply || 0,
                views: ddoc.views || 0,
                highlight: !!ddoc.highlight,
            };
        });
        this.view('dtoj_discuss', {
            groups,
            node,
            threads,
            page,
            pages: dpcount,
            qs: queryString({ node }),
        });
    }
}

class DtojPlaceHandler extends DtojPageHandler {
    place = 'shop';
    pageName = 'dtoj_shop';

    async get() {
        this.view('dtoj_place', { ...places[this.place], pageName: this.pageName });
    }
}

class DtojShopHandler extends DtojPlaceHandler {
    place = 'shop';
    pageName = 'dtoj_shop';
}
class DtojBugfindHandler extends DtojPlaceHandler {
    place = 'bugfind';
    pageName = 'dtoj_bugfind';
}
class DtojJigsawHandler extends DtojPlaceHandler {
    place = 'jigsaw';
    pageName = 'dtoj_jigsaw';
}
class DtojBlackboxHandler extends DtojPlaceHandler {
    place = 'blackbox';
    pageName = 'dtoj_blackbox';
}
class DtojFarmHandler extends DtojPlaceHandler {
    place = 'farm';
    pageName = 'dtoj_farm';
}
class DtojThemeHandler extends DtojPlaceHandler {
    place = 'theme';
    pageName = 'dtoj_theme';
}
class DtojCardHandler extends DtojPlaceHandler {
    place = 'card';
    pageName = 'dtoj_card';
}

class DtojProblemHandler extends DtojDataHandler {
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, page = 1) {
        const query: any = {};
        if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) {
            query.$or = [
                { hidden: false },
                { owner: this.user._id },
                { maintainer: this.user._id },
            ];
        }
        await this.ctx.parallel('problem/list', query, this, []);
        const [pdocs, ppcount] = await this.paginate(
            ProblemModel.getMulti(domainId, query).sort({ sort: 1, docId: 1 }),
            page,
            'problem',
        );
        this.view('dtoj_problems', {
            problems: pdocs.map((pdoc) => ({
                title: pdoc.title,
                link: pdoc.pid || pdoc.docId,
                tags: pdoc.tag || [],
                level: problemLevel(pdoc),
            })),
            page,
            pages: ppcount,
        });
    }
}

function dropEarlierRoutes(ctx: Context, paths: string[]) {
    const stack = (ctx as any).server.router.stack as { path?: string }[];
    const want = new Set(paths);
    const last = new Map<string, number>();
    for (let i = 0; i < stack.length; i++) {
        const path = stack[i].path;
        if (path && want.has(path)) last.set(path, i);
    }
    for (let i = stack.length - 1; i >= 0; i--) {
        const path = stack[i].path;
        if (path && want.has(path) && last.get(path) !== i) stack.splice(i, 1);
    }
}

const titles: Record<string, string> = {
    dtoj_home: '首页',
    dtoj_training: '训练',
    dtoj_training_detail: '课程章节',
    dtoj_wiki: 'WIKI',
    dtoj_wiki_article: 'WIKI',
    dtoj_contest: '比赛',
    dtoj_contest_detail: '比赛详情',
    dtoj_rank: '等级分',
    dtoj_record: '评测队列',
    dtoj_community: '社区',
    dtoj_post: '帖子',
    dtoj_community_detail: '帖子',
    dtoj_discuss: '讨论',
    dtoj_place: '说明',
    dtoj_shop: '神秘商店',
    dtoj_theme: '主题商店',
    dtoj_card: '闪卡',
    dtoj_bugfind: '找茬',
    dtoj_jigsaw: '拼图',
    dtoj_blackbox: '黑盒',
    dtoj_farm: '农场',
    dtoj_problems: '题库',
};

export async function apply(ctx: Context) {
    const nav = global.Hydro.ui.nodes.Nav as unknown[];
    nav.splice(0, nav.length);
    const items: [string, string, string][] = [
        ['homepage', 'dtoj_home', '首页'],
        ['training_main', 'dtoj_training', '训练'],
        ['dtoj_wiki', 'dtoj_wiki', 'WIKI'],
        ['contest_main', 'dtoj_contest', '比赛'],
        ['dtoj_rank', 'dtoj_rank', '等级分'],
        ['record_main', 'dtoj_record', '评测队列'],
        ['dtoj_community', 'dtoj_community', '社区'],
        ['discussion_main', 'dtoj_discuss', '讨论'],
        ['dtoj_shop', 'dtoj_shop', '神秘商店'],
    ];
    for (const [name, prefix, displayName] of items) {
        global.Hydro.ui.inject('Nav', name, { prefix, displayName });
    }

    ctx.Route('homepage', '/', DtojHomeHandler);
    ctx.Route('training_main', '/training', DtojTrainingHandler, PERM.PERM_VIEW_TRAINING);
    ctx.Route('dtoj_training_detail', '/training/:tid', DtojTrainingDetailHandler, PERM.PERM_VIEW_TRAINING);
    ctx.Route('dtoj_wiki', '/yzy-wiki', DtojWikiHandler);
    ctx.Route('dtoj_wiki_article', '/yzy-wiki/:slug', DtojWikiArticleHandler);
    ctx.Route('contest_main', '/contest', DtojContestHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('dtoj_contest_detail', '/contest/:tid', DtojContestDetailHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('dtoj_rank', '/rank', DtojRankHandler, PERM.PERM_VIEW_RANKING);
    ctx.Route('record_main', '/record', DtojRecordHandler);
    ctx.Route('dtoj_community', '/community', DtojCommunityHandler);
    ctx.Route('dtoj_community_detail', '/community/:id', DtojCommunityDetailHandler);
    ctx.Route('discussion_main', '/discuss', DtojDiscussHandler, PERM.PERM_VIEW_DISCUSSION);
    ctx.Route('dtoj_shop', '/coin/shop', DtojShopHandler);
    ctx.Route('dtoj_theme', '/coin/theme', DtojThemeHandler);
    ctx.Route('dtoj_card', '/coin/cards', DtojCardHandler);
    ctx.Route('dtoj_bugfind', '/bugfind', DtojBugfindHandler);
    ctx.Route('dtoj_jigsaw', '/jigsaw', DtojJigsawHandler);
    ctx.Route('dtoj_blackbox', '/blackbox', DtojBlackboxHandler);
    ctx.Route('dtoj_farm', '/farm', DtojFarmHandler);
    ctx.Route('dtoj_problems', '/dtoj/p', DtojProblemHandler, PERM.PERM_VIEW_PROBLEM);

    dropEarlierRoutes(ctx, [
        '/',
        '/training',
        '/training/:tid',
        '/contest',
        '/contest/:tid',
        '/record',
        '/discuss',
    ]);

    for (const lang of ['zh', 'zh_TW', 'en', 'kr']) {
        ctx.i18n.load(lang, titles);
    }
}
