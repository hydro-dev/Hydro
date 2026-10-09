import { Context, Handler } from 'hydrooj';
import {
    activities, announcements, brand, chapterTitles, communityTabs, contests, contestTabs,
    countdowns, courseKinds, courses, directions, discussNodes, paths, places, posts,
    problems, ranks, records, threads, wikiGroups,
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

class DtojPageHandler extends Handler {
    noCheckPermView = true;

    view(name: string, body: Record<string, any> = {}) {
        this.response.template = `${name}.html`;
        this.response.body = body;
    }
}

class DtojHomeHandler extends DtojPageHandler {
    async get() {
        this.view('dtoj_home', {
            brand,
            coin: 256,
            streak: 6,
            countdowns,
            activities,
            announcements,
            paths,
            wikiGroups,
        });
    }
}

class DtojTrainingHandler extends DtojPageHandler {
    async get() {
        const direction = pick(queryOf(this, 'direction'), directions, '');
        const kind = pick(queryOf(this, 'kind'), courseKinds, '');
        this.view('dtoj_training', {
            directions,
            kinds: courseKinds,
            direction,
            kind,
            hot: courses.filter((c) => c.hot),
            courses,
        });
    }
}

class DtojTrainingDetailHandler extends DtojPageHandler {
    async get() {
        const id = String(this.args.tid || '');
        const course = courses.find((c) => c.id === id) || courses[0];
        const chapters = Array.from({ length: course.chapters }, (_, i) => ({
            index: i + 1,
            title: chapterTitles[i % chapterTitles.length],
        }));
        this.view('dtoj_training_detail', { course, chapters });
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
            const cell = group.cells.find((c) => c.id === id);
            if (cell) hit = { title: cell.title, group: group.title };
        }
        this.view('dtoj_wiki_article', hit);
    }
}

class DtojContestHandler extends DtojPageHandler {
    async get() {
        const tab = pick(queryOf(this, 'tab'), contestTabs, contestTabs[0]);
        this.view('dtoj_contest', {
            tabs: contestTabs,
            tab,
            featured: contests.find((c) => c.featured) || contests[0],
            contests,
        });
    }
}

class DtojContestDetailHandler extends DtojPageHandler {
    async get() {
        const id = String(this.args.tid || '');
        const contest = contests.find((c) => c.id === id) || contests[0];
        this.view('dtoj_contest_detail', { contest });
    }
}

class DtojRankHandler extends DtojPageHandler {
    async get() {
        const page = Math.min(2, Math.max(1, Number(queryOf(this, 'page')) || 1));
        this.view('dtoj_rank', { rows: ranks, page, pages: 2 });
    }
}

class DtojRecordHandler extends DtojPageHandler {
    async get() {
        this.view('dtoj_record', {
            records,
            uidOrName: queryOf(this, 'uidOrName'),
            pid: queryOf(this, 'pid'),
            lang: queryOf(this, 'lang'),
            status: queryOf(this, 'status'),
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
        const post = posts.find((p) => p.id === id) || posts[0];
        this.view('dtoj_post', { post });
    }
}

class DtojDiscussHandler extends DtojPageHandler {
    async get() {
        const node = pick(queryOf(this, 'node'), discussNodes, discussNodes[0]);
        this.view('dtoj_discuss', { nodes: discussNodes, node, threads });
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

class DtojProblemHandler extends DtojPageHandler {
    async get() {
        this.view('dtoj_problems', { problems });
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
    ctx.Route('training_main', '/training', DtojTrainingHandler);
    ctx.Route('dtoj_training_detail', '/training/:tid', DtojTrainingDetailHandler);
    ctx.Route('dtoj_wiki', '/yzy-wiki', DtojWikiHandler);
    ctx.Route('dtoj_wiki_article', '/yzy-wiki/:slug', DtojWikiArticleHandler);
    ctx.Route('contest_main', '/contest', DtojContestHandler);
    ctx.Route('dtoj_contest_detail', '/contest/:tid', DtojContestDetailHandler);
    ctx.Route('dtoj_rank', '/rank', DtojRankHandler);
    ctx.Route('record_main', '/record', DtojRecordHandler);
    ctx.Route('dtoj_community', '/community', DtojCommunityHandler);
    ctx.Route('dtoj_community_detail', '/community/:id', DtojCommunityDetailHandler);
    ctx.Route('discussion_main', '/discuss', DtojDiscussHandler);
    ctx.Route('dtoj_shop', '/coin/shop', DtojShopHandler);
    ctx.Route('dtoj_theme', '/coin/theme', DtojThemeHandler);
    ctx.Route('dtoj_card', '/coin/cards', DtojCardHandler);
    ctx.Route('dtoj_bugfind', '/bugfind', DtojBugfindHandler);
    ctx.Route('dtoj_jigsaw', '/jigsaw', DtojJigsawHandler);
    ctx.Route('dtoj_blackbox', '/blackbox', DtojBlackboxHandler);
    ctx.Route('dtoj_farm', '/farm', DtojFarmHandler);
    ctx.Route('dtoj_problems', '/dtoj/p', DtojProblemHandler);

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
