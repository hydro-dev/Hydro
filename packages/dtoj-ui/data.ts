export const brand = '青石练习场';

export const directions = ['CSP-X', 'CSP-J', 'CSP-S', 'NOIP', '省选', 'NOI', 'GESP', '其他'];
export const courseKinds = ['基础入门', '算法专题', '真题训练', '集训提升', '日常训练'];

export interface Course {
    id: string;
    title: string;
    brief: string;
    chapters: number;
    problems: number;
    hot: boolean;
    direction: string;
    kind: string;
}

export const courses: Course[] = [
    {
        id: 'cspj-start', title: '入门语法一周', brief: '变量、分支和循环的示例课程。',
        chapters: 6, problems: 24, hot: true, direction: 'CSP-J', kind: '基础入门',
    },
    {
        id: 'graph-basic', title: '图论专题', brief: '从遍历到最短路的示例提纲。',
        chapters: 8, problems: 30, hot: true, direction: 'CSP-S', kind: '算法专题',
    },
    {
        id: 'noip-past', title: '近年真题散步', brief: '按年份排好的示例真题课。',
        chapters: 5, problems: 20, hot: true, direction: 'NOIP', kind: '真题训练',
    },
    {
        id: 'camp-raise', title: '集训提高营', brief: '两周节奏的示例集训。',
        chapters: 10, problems: 40, hot: true, direction: '省选', kind: '集训提升',
    },
    {
        id: 'daily-loop', title: '每日一练', brief: '短练习，用来保持手感。',
        chapters: 4, problems: 16, hot: false, direction: 'CSP-X', kind: '日常训练',
    },
    {
        id: 'math-pack', title: '竞赛数学小包', brief: '数论和组合的示例讲次。',
        chapters: 7, problems: 18, hot: false, direction: 'NOI', kind: '算法专题',
    },
    {
        id: 'gesp-l2', title: '等级考试二级', brief: '按考点拆开的示例课程。',
        chapters: 6, problems: 22, hot: false, direction: 'GESP', kind: '基础入门',
    },
    {
        id: 'misc-fun', title: '其他方向试听', brief: '不在上面几类里的示例课。',
        chapters: 3, problems: 9, hot: false, direction: '其他', kind: '日常训练',
    },
];

export const chapterTitles = ['读题', '例题', '练习', '小结'];

export const wikiGroups = [
    {
        id: 'algo',
        title: '核心算法',
        cells: [
            { id: 'bfs', title: '广度优先搜索' },
            { id: 'dijkstra', title: '最短路' },
            { id: 'dp-knap', title: '背包' },
        ],
    },
    {
        id: 'math',
        title: '数学',
        cells: [
            { id: 'mod', title: '取模' },
            { id: 'comb', title: '组合计数' },
            { id: 'gcd', title: '最大公约数' },
        ],
    },
    {
        id: 'lists',
        title: '精选题单',
        cells: [
            { id: 'list-basic', title: '语法题单' },
            { id: 'list-graph', title: '图论题单' },
        ],
    },
    {
        id: 'frame',
        title: '竞赛与框架',
        cells: [
            { id: 'oi-rule', title: '赛制说明' },
            { id: 'template-code', title: '代码框架' },
        ],
    },
    {
        id: 'talk',
        title: '社区杂谈',
        cells: [
            { id: 'how-to-ask', title: '怎样提问' },
            { id: 'notebook', title: '错题本怎么记' },
        ],
    },
];

export const contestTabs = ['精选', '周赛', '月赛', '模拟赛', '授权参赛', '其他'];

export interface ContestCard {
    id: string;
    title: string;
    tab: string;
    group: string;
    hours: number;
    problems: number;
    people: number;
    rule: string;
    access: string;
    begin: string;
    end: string;
    featured?: boolean;
}

export const contests: ContestCard[] = [
    {
        id: 'week-01', title: '周末算法赛 · 示例', tab: '周赛', group: '普及组',
        hours: 3, problems: 4, people: 128, rule: 'OI', access: '公开',
        begin: '2026-10-11 14:00', end: '2026-10-11 17:00', featured: true,
    },
    {
        id: 'month-03', title: '三月月赛 · 示例', tab: '月赛', group: '提高组',
        hours: 4, problems: 5, people: 86, rule: 'OI', access: '公开',
        begin: '2026-10-18 13:00', end: '2026-10-18 17:00',
    },
    {
        id: 'mock-noip', title: '模拟赛 · 示例', tab: '模拟赛', group: '提高组',
        hours: 4.5, problems: 4, people: 64, rule: 'OI', access: '邀请码',
        begin: '2026-10-25 08:30', end: '2026-10-25 13:00',
    },
    {
        id: 'auth-01', title: '授权参赛 · 示例', tab: '授权参赛', group: '入门组',
        hours: 2, problems: 3, people: 40, rule: 'IOI', access: '邀请码',
        begin: '2026-11-01 19:00', end: '2026-11-01 21:00',
    },
    {
        id: 'pick-01', title: '精选公开赛 · 示例', tab: '精选', group: '普及组',
        hours: 3, problems: 4, people: 210, rule: 'IOI', access: '公开',
        begin: '2026-11-08 14:00', end: '2026-11-08 17:00',
    },
    {
        id: 'other-01', title: '其他活动赛 · 示例', tab: '其他', group: '不限',
        hours: 2, problems: 6, people: 33, rule: 'OI', access: '公开',
        begin: '2026-11-15 10:00', end: '2026-11-15 12:00',
    },
];

export const ranks = [
    { name: '松子', now: 1820, best: 1902 },
    { name: '林夏', now: 1766, best: 1810 },
    { name: '阿宁', now: 1712, best: 1712 },
    { name: '周舟', now: 1688, best: 1744 },
    { name: '小满', now: 1640, best: 1690 },
    { name: '何川', now: 1595, best: 1622 },
    { name: '白露', now: 1548, best: 1601 },
    { name: '江北', now: 1502, best: 1533 },
    { name: '青禾', now: 1466, best: 1490 },
    { name: '南星', now: 1420, best: 1488 },
    { name: '晚风', now: 1388, best: 1410 },
    { name: '石头', now: 1320, best: 1366 },
];

export const records = [
    { status: '通过', score: 100, time: '12ms', memory: '1.2MB', lang: 'C++', problem: 'A+B', user: '松子' },
    { status: '部分分', score: 60, time: '88ms', memory: '3.4MB', lang: 'C++', problem: '迷宫', user: '林夏' },
    { status: '编译错误', score: 0, time: '—', memory: '—', lang: 'Python', problem: '数列', user: '阿宁' },
    { status: '答案错误', score: 0, time: '40ms', memory: '2.1MB', lang: 'C++', problem: '最短路', user: '周舟' },
    { status: '运行中', score: '—', time: '—', memory: '—', lang: 'C++', problem: '背包', user: '小满' },
];

export const communityTabs = ['最新', '最热', '精华', '推荐'];

export const posts = [
    {
        id: 'note-1', title: '这周把图遍历写顺了', author: '松子', time: '2026-10-08 21:10',
        tags: ['图论', '记录'], summary: '示例帖：先写遍历，再改成最短路。', views: 320, likes: 18,
    },
    {
        id: 'note-2', title: '模拟赛复盘三条', author: '林夏', time: '2026-10-07 18:02',
        tags: ['复盘'], summary: '示例帖：读题慢、边界漏、常数大。', views: 510, likes: 42,
    },
    {
        id: 'note-3', title: '一份可以抄的代码框架', author: '阿宁', time: '2026-10-06 09:30',
        tags: ['模板', '精华'], summary: '示例帖：输入输出和调试开关占位。', views: 880, likes: 67,
    },
    {
        id: 'note-4', title: '推荐先做哪套入门题', author: '周舟', time: '2026-10-05 12:00',
        tags: ['推荐'], summary: '示例帖：按语法、模拟、枚举排队。', views: 240, likes: 15,
    },
];

export const discussNodes = ['站务', '比赛', '答疑', '训练', '题解', '通知', '代码'];

export const threads = [
    { title: '站点维护通知（示例）', author: '管理员', time: '2026-10-09 08:00', node: '站务', replies: 2 },
    { title: '周末赛什么时候发题解', author: '小满', time: '2026-10-08 16:20', node: '比赛', replies: 5 },
    { title: '循环变量为什么从 0 开始', author: '何川', time: '2026-10-08 11:02', node: '答疑', replies: 3 },
    { title: '图论课第三章打不开？', author: '白露', time: '2026-10-07 20:11', node: '训练', replies: 1 },
    { title: '背包题的一种写法', author: '江北', time: '2026-10-07 15:40', node: '题解', replies: 8 },
    { title: '新课上架说明', author: '管理员', time: '2026-10-06 10:00', node: '通知', replies: 0 },
    { title: '请教一段递归', author: '南星', time: '2026-10-05 19:18', node: '代码', replies: 4 },
];

export const problems = [
    { name: '两数之和', tags: ['入门', '模拟'], level: '入门' },
    { name: '数字三角形', tags: ['动态规划'], level: '普及' },
    { name: '迷宫最短路', tags: ['搜索', '图论'], level: '普及' },
    { name: '线段覆盖', tags: ['贪心'], level: '提高' },
    { name: '矩阵乘法', tags: ['数学'], level: '提高' },
];

export const countdowns = [
    { name: 'CSP-J', days: 86 },
    { name: 'CSP-S', days: 86 },
    { name: 'NOIP', days: 142 },
];

export const activities = [
    { id: 'bugfind', href: '/bugfind', title: '找茬', about: '在示例代码里找出写错的地方。' },
    { id: 'jigsaw', href: '/jigsaw', title: '拼图', about: '把打乱的代码行排回可运行的顺序。' },
    { id: 'blackbox', href: '/blackbox', title: '黑盒', about: '只看输入和输出，猜程序在做什么。' },
    { id: 'farm', href: '/farm', title: '农场', about: '用代码经营一小块示例农场。' },
];

export const places: Record<string, { title: string, about: string, reward: string }> = {
    shop: {
        title: '神秘商店',
        about: '用练习站里的羊币兑换外观和道具。这一期只说明商店是做什么的。',
        reward: '示例奖励：主题券 × 1，闪卡包 × 1。没有库存，也不能结算。',
    },
    bugfind: {
        title: '找茬',
        about: '给出一段有错的代码，标出错误所在。没有关卡数据。',
        reward: '示例奖励：羊币 10。不会入账。',
    },
    jigsaw: {
        title: '拼图',
        about: '把语句拼成一段能通过样例的程序。没有关卡数据。',
        reward: '示例奖励：羊币 10。不会入账。',
    },
    blackbox: {
        title: '黑盒',
        about: '根据几组输入输出推断程序行为。没有关卡数据。',
        reward: '示例奖励：羊币 15。不会入账。',
    },
    farm: {
        title: '农场',
        about: '按说明完成一小段经营逻辑。没有关卡数据。',
        reward: '示例奖励：羊币 20。不会入账。',
    },
    theme: {
        title: '主题商店',
        about: '挑选界面皮肤。这一期只展示入口说明。',
        reward: '示例商品：浅色纸、深色夜。没有库存，也不能购买。',
    },
    card: {
        title: '闪卡商店',
        about: '收集示例闪卡。这一期只展示入口说明。',
        reward: '示例卡包：算法三张。没有库存，也不能购买。',
    },
};

export const announcements = [
    { title: '界面示例已打开', body: '现在看到的是静态页面，数字都是写死的。' },
    { title: '课程和比赛尚未接上题库', body: '点进卡片只能看到占位说明，没有真实题目。' },
];

export const paths = [
    { title: '题库', href: '/dtoj/p', text: '先看名称、标签和难度长什么样。' },
    { title: '课程', href: '/training', text: '按方向和类型浏览示例课程。' },
    { title: '比赛', href: '/contest', text: '看赛制、时间和公开方式。' },
    { title: '复盘', href: '/discuss?node=题解', text: '到讨论里看题解分类的示例帖。' },
];
