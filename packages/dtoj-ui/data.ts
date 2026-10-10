export const brand = '青石练习场';

export const directions = ['CSP-X', 'CSP-J', 'CSP-S', 'NOIP', '省选', 'NOI', 'GESP', '其他'];
export const courseKinds = ['基础入门', '算法专题', '真题训练', '集训提升', '日常训练'];

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
