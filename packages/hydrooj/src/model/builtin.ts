// @ts-nocheck

import { Udoc } from '../interface';

/*
 * Why nocheck?
 * BitInt requires at least ES2020, but we can't use it as
 * NodeJS doesn't support some of this new features.
 * e.g.: object?.property
 */
export const PERM = {
    PERM_NONE: 0n,

    // Domain Settings
    PERM_VIEW: 1n << 0n,
    PERM_EDIT_DOMAIN: 1n << 1n,
    PERM_MOD_BADGE: 1n << 2n,

    // Problem and Record
    PERM_CREATE_PROBLEM: 1n << 4n,
    PERM_EDIT_PROBLEM: 1n << 5n,
    /** @deprecated */
    PERM_EDIT_PROBLEM_SELF: 1n << 6n,
    PERM_VIEW_PROBLEM: 1n << 7n,
    PERM_VIEW_PROBLEM_HIDDEN: 1n << 8n,
    PERM_SUBMIT_PROBLEM: 1n << 9n,
    PERM_READ_PROBLEM_DATA: 1n << 10n,
    PERM_READ_RECORD_CODE: 1n << 12n,
    PERM_REJUDGE_PROBLEM: 1n << 13n,
    PERM_REJUDGE: 1n << 14n,

    // Problem Solution
    PERM_VIEW_PROBLEM_SOLUTION: 1n << 15n,
    PERM_CREATE_PROBLEM_SOLUTION: 1n << 16n,
    PERM_VOTE_PROBLEM_SOLUTION: 1n << 17n,
    PERM_EDIT_PROBLEM_SOLUTION: 1n << 18n,
    PERM_EDIT_PROBLEM_SOLUTION_SELF: 1n << 19n,
    PERM_DELETE_PROBLEM_SOLUTION: 1n << 20n,
    PERM_DELETE_PROBLEM_SOLUTION_SELF: 1n << 21n,
    PERM_REPLY_PROBLEM_SOLUTION: 1n << 22n,
    PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF: 1n << 24n,
    PERM_DELETE_PROBLEM_SOLUTION_REPLY: 1n << 25n,
    PERM_DELETE_PROBLEM_SOLUTION_REPLY_SELF: 1n << 26n,

    // Discussion
    PERM_VIEW_DISCUSSION: 1n << 27n,
    PERM_CREATE_DISCUSSION: 1n << 28n,
    PERM_HIGHLIGHT_DISCUSSION: 1n << 29n,
    PERM_PIN_DISCUSSION: 1n << 61n,
    PERM_EDIT_DISCUSSION: 1n << 30n,
    PERM_EDIT_DISCUSSION_SELF: 1n << 31n,
    PERM_DELETE_DISCUSSION: 1n << 32n,
    PERM_DELETE_DISCUSSION_SELF: 1n << 33n,
    PERM_REPLY_DISCUSSION: 1n << 34n,
    PERM_EDIT_DISCUSSION_REPLY_SELF: 1n << 36n,
    PERM_DELETE_DISCUSSION_REPLY: 1n << 38n,
    PERM_DELETE_DISCUSSION_REPLY_SELF: 1n << 39n,
    PERM_DELETE_DISCUSSION_REPLY_SELF_DISCUSSION: 1n << 40n,

    // Contest
    PERM_VIEW_CONTEST: 1n << 41n,
    PERM_VIEW_CONTEST_SCOREBOARD: 1n << 42n,
    PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD: 1n << 43n,
    PERM_CREATE_CONTEST: 1n << 44n,
    PERM_ATTEND_CONTEST: 1n << 45n,
    PERM_EDIT_CONTEST: 1n << 50n,
    PERM_EDIT_CONTEST_SELF: 1n << 51n,

    // Homework
    PERM_VIEW_HOMEWORK: 1n << 52n,
    PERM_VIEW_HOMEWORK_SCOREBOARD: 1n << 53n,
    PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD: 1n << 54n,
    PERM_CREATE_HOMEWORK: 1n << 55n,
    PERM_ATTEND_HOMEWORK: 1n << 56n,
    PERM_EDIT_HOMEWORK: 1n << 57n,
    PERM_EDIT_HOMEWORK_SELF: 1n << 58n,

    // Training
    PERM_VIEW_TRAINING: 1n << 46n,
    PERM_CREATE_TRAINING: 1n << 47n,
    PERM_EDIT_TRAINING: 1n << 48n,
    PERM_EDIT_TRAINING_SELF: 1n << 49n,

    // Ranking
    PERM_VIEW_RANKING: 1n << 59n,

    // Placeholder
    PERM_ALL: -1n,
    PERM_BASIC: 0n,
    PERM_DEFAULT: 0n,
    PERM_ADMIN: -1n,

    PERM_NEVER: 1n << 60n,
};

export const Permission = (family: string, key: BigInt, desc: string) => ({ family, key, desc });

export const PERMS = [
    Permission('perm_general', PERM.PERM_VIEW, 'View this domain'),
    Permission('perm_general', PERM.PERM_EDIT_DOMAIN, 'Edit domain settings'),
    Permission('perm_general', PERM.PERM_MOD_BADGE, 'Show MOD badge'),
    Permission('perm_problem', PERM.PERM_CREATE_PROBLEM, 'Create problems'),
    Permission('perm_problem', PERM.PERM_EDIT_PROBLEM, 'Edit problems'),
    Permission('perm_problem', PERM.PERM_EDIT_PROBLEM_SELF, 'Edit own problems'),
    Permission('perm_problem', PERM.PERM_VIEW_PROBLEM, 'View problems'),
    Permission('perm_problem', PERM.PERM_VIEW_PROBLEM_HIDDEN, 'View hidden problems'),
    Permission('perm_problem', PERM.PERM_SUBMIT_PROBLEM, 'Submit problem'),
    Permission('perm_problem', PERM.PERM_READ_PROBLEM_DATA, 'Read data of problem'),
    Permission('perm_record', PERM.PERM_READ_RECORD_CODE, 'Read record codes'),
    Permission('perm_record', PERM.PERM_REJUDGE_PROBLEM, 'Rejudge problems'),
    Permission('perm_record', PERM.PERM_REJUDGE, 'Rejudge records'),
    Permission('perm_problem_solution', PERM.PERM_VIEW_PROBLEM_SOLUTION, 'View problem solutions'),
    Permission('perm_problem_solution', PERM.PERM_CREATE_PROBLEM_SOLUTION, 'Create problem solutions'),
    Permission('perm_problem_solution', PERM.PERM_VOTE_PROBLEM_SOLUTION, 'Vote problem solutions'),
    Permission('perm_problem_solution', PERM.PERM_EDIT_PROBLEM_SOLUTION, 'Edit problem solutions'),
    Permission('perm_problem_solution', PERM.PERM_EDIT_PROBLEM_SOLUTION_SELF, 'Edit own problem solutions'),
    Permission('perm_problem_solution', PERM.PERM_DELETE_PROBLEM_SOLUTION, 'Delete problem solutions'),
    Permission('perm_problem_solution', PERM.PERM_DELETE_PROBLEM_SOLUTION_SELF, 'Delete own problem solutions'),
    Permission('perm_problem_solution', PERM.PERM_REPLY_PROBLEM_SOLUTION, 'Reply problem solutions'),
    Permission('perm_problem_solution', PERM.PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF, 'Edit own problem solution replies'),
    Permission('perm_problem_solution', PERM.PERM_DELETE_PROBLEM_SOLUTION_REPLY, 'Delete problem solution replies'),
    Permission('perm_problem_solution', PERM.PERM_DELETE_PROBLEM_SOLUTION_REPLY_SELF, 'Delete own problem solution replies'),
    Permission('perm_discussion', PERM.PERM_VIEW_DISCUSSION, 'View discussions'),
    Permission('perm_discussion', PERM.PERM_CREATE_DISCUSSION, 'Create discussions'),
    Permission('perm_discussion', PERM.PERM_HIGHLIGHT_DISCUSSION, 'Highlight discussions'),
    Permission('perm_discussion', PERM.PERM_EDIT_DISCUSSION, 'Edit discussions'),
    Permission('perm_discussion', PERM.PERM_EDIT_DISCUSSION_SELF, 'Edit own discussions'),
    Permission('perm_discussion', PERM.PERM_DELETE_DISCUSSION, 'Delete discussions'),
    Permission('perm_discussion', PERM.PERM_DELETE_DISCUSSION_SELF, 'Delete own discussions'),
    Permission('perm_discussion', PERM.PERM_REPLY_DISCUSSION, 'Reply discussions'),
    Permission('perm_discussion', PERM.PERM_EDIT_DISCUSSION_REPLY_SELF, 'Edit own discussion replies'),
    Permission('perm_discussion', PERM.PERM_DELETE_DISCUSSION_REPLY, 'Delete discussion replies'),
    Permission('perm_discussion', PERM.PERM_DELETE_DISCUSSION_REPLY_SELF, 'Delete own discussion replies'),
    Permission('perm_discussion', PERM.PERM_DELETE_DISCUSSION_REPLY_SELF_DISCUSSION, 'Delete discussion replies of own discussion'),
    Permission('perm_contest', PERM.PERM_VIEW_CONTEST, 'View contests'),
    Permission('perm_contest', PERM.PERM_VIEW_CONTEST_SCOREBOARD, 'View contest scoreboard'),
    Permission('perm_contest', PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD, 'View hidden contest submission status and scoreboard'),
    Permission('perm_contest', PERM.PERM_CREATE_CONTEST, 'Create contests'),
    Permission('perm_contest', PERM.PERM_ATTEND_CONTEST, 'Attend contests'),
    Permission('perm_contest', PERM.PERM_EDIT_CONTEST, 'Edit any contests'),
    Permission('perm_contest', PERM.PERM_EDIT_CONTEST_SELF, 'Edit own contests'),
    Permission('perm_homework', PERM.PERM_VIEW_HOMEWORK, 'View homework'),
    Permission('perm_homework', PERM.PERM_VIEW_HOMEWORK_SCOREBOARD, 'View homework scoreboard'),
    Permission('perm_homework', PERM.PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD, 'View hidden homework submission status and scoreboard'),
    Permission('perm_homework', PERM.PERM_CREATE_HOMEWORK, 'Create homework'),
    Permission('perm_homework', PERM.PERM_ATTEND_HOMEWORK, 'Claim homework'),
    Permission('perm_homework', PERM.PERM_EDIT_HOMEWORK, 'Edit any homework'),
    Permission('perm_homework', PERM.PERM_EDIT_HOMEWORK_SELF, 'Edit own homework'),
    Permission('perm_training', PERM.PERM_VIEW_TRAINING, 'View training plans'),
    Permission('perm_training', PERM.PERM_CREATE_TRAINING, 'Create training plans'),
    Permission('perm_training', PERM.PERM_EDIT_TRAINING, 'Edit training plans'),
    Permission('perm_training', PERM.PERM_EDIT_TRAINING_SELF, 'Edit own training plans'),
    Permission('perm_ranking', PERM.PERM_VIEW_RANKING, 'View ranking'),
];

export const PERMS_BY_FAMILY = {};
for (const p of PERMS) {
    if (!PERMS_BY_FAMILY[p.family]) PERMS_BY_FAMILY[p.family] = [p];
    else PERMS_BY_FAMILY[p.family].push(p);
}

PERM.PERM_BASIC = PERM.PERM_VIEW
    | PERM.PERM_VIEW_PROBLEM
    | PERM.PERM_VIEW_PROBLEM_SOLUTION
    | PERM.PERM_VIEW_DISCUSSION
    | PERM.PERM_VIEW_CONTEST
    | PERM.PERM_VIEW_CONTEST_SCOREBOARD
    | PERM.PERM_VIEW_HOMEWORK
    | PERM.PERM_VIEW_HOMEWORK_SCOREBOARD
    | PERM.PERM_VIEW_TRAINING
    | PERM.PERM_VIEW_RANKING;

PERM.PERM_DEFAULT = PERM.PERM_VIEW
    | PERM.PERM_VIEW_PROBLEM
    | PERM.PERM_EDIT_PROBLEM_SELF
    | PERM.PERM_SUBMIT_PROBLEM
    | PERM.PERM_VIEW_PROBLEM_SOLUTION
    | PERM.PERM_CREATE_PROBLEM_SOLUTION
    | PERM.PERM_VOTE_PROBLEM_SOLUTION
    | PERM.PERM_EDIT_PROBLEM_SOLUTION_SELF
    | PERM.PERM_DELETE_PROBLEM_SOLUTION_SELF
    | PERM.PERM_REPLY_PROBLEM_SOLUTION
    | PERM.PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF
    | PERM.PERM_DELETE_PROBLEM_SOLUTION_REPLY_SELF
    | PERM.PERM_VIEW_DISCUSSION
    | PERM.PERM_CREATE_DISCUSSION
    | PERM.PERM_EDIT_DISCUSSION_SELF
    | PERM.PERM_REPLY_DISCUSSION
    | PERM.PERM_EDIT_DISCUSSION_REPLY_SELF
    | PERM.PERM_DELETE_DISCUSSION_REPLY_SELF
    | PERM.PERM_DELETE_DISCUSSION_REPLY_SELF_DISCUSSION
    | PERM.PERM_VIEW_CONTEST
    | PERM.PERM_VIEW_CONTEST_SCOREBOARD
    | PERM.PERM_ATTEND_CONTEST
    | PERM.PERM_EDIT_CONTEST_SELF
    | PERM.PERM_VIEW_HOMEWORK
    | PERM.PERM_VIEW_HOMEWORK_SCOREBOARD
    | PERM.PERM_ATTEND_HOMEWORK
    | PERM.PERM_EDIT_HOMEWORK_SELF
    | PERM.PERM_VIEW_TRAINING
    | PERM.PERM_CREATE_TRAINING
    | PERM.PERM_EDIT_TRAINING_SELF
    | PERM.PERM_SUBMIT_PROBLEM
    | PERM.PERM_CREATE_PROBLEM_SOLUTION
    | PERM.PERM_VOTE_PROBLEM_SOLUTION
    | PERM.PERM_REPLY_PROBLEM_SOLUTION
    | PERM.PERM_CREATE_DISCUSSION
    | PERM.PERM_REPLY_DISCUSSION
    | PERM.PERM_ATTEND_CONTEST
    | PERM.PERM_CREATE_TRAINING
    | PERM.PERM_ATTEND_HOMEWORK
    | PERM.PERM_VIEW_RANKING;

PERM.PERM_ADMIN = PERM.PERM_ALL;

export const PRIV = {
    PRIV_NONE: 0,
    PRIV_EDIT_SYSTEM: 1 << 0, // renamed from PRIV_SET_PRIV
    PRIV_SET_PERM: 1 << 1,
    PRIV_USER_PROFILE: 1 << 2,
    PRIV_REGISTER_USER: 1 << 3,
    PRIV_READ_PROBLEM_DATA: 1 << 4,
    PRIV_READ_PRETEST_DATA: 1 << 5, // deprecated
    PRIV_READ_PRETEST_DATA_SELF: 1 << 6, // deprecated
    PRIV_READ_RECORD_CODE: 1 << 7,
    PRIV_VIEW_HIDDEN_RECORD: 1 << 8,
    PRIV_JUDGE: 1 << 9, // (renamed)
    PRIV_CREATE_DOMAIN: 1 << 10,
    PRIV_VIEW_ALL_DOMAIN: 1 << 11,
    PRIV_MANAGE_ALL_DOMAIN: 1 << 12,
    PRIV_REJUDGE: 1 << 13,
    PRIV_VIEW_USER_SECRET: 1 << 14,
    PRIV_VIEW_JUDGE_STATISTICS: 1 << 15,
    PRIV_UNLIMITED_RATE: 1 << 22,

    PRIV_ALL: -1,
    PRIV_DEFAULT: 0,
    PRIV_NEVER: 1 << 20,

    /** @deprecated */
    PRIV_CREATE_FILE: 1 << 16,
    /** @deprecated */
    PRIV_UNLIMITED_QUOTA: 1 << 17,
    /** @deprecated */
    PRIV_DELETE_FILE: 1 << 18,
    /** @deprecated */
    PRIV_DELETE_FILE_SELF: 1 << 19,
};

PRIV.PRIV_DEFAULT = PRIV.PRIV_USER_PROFILE
    + PRIV.PRIV_REGISTER_USER
    + PRIV.PRIV_READ_PRETEST_DATA_SELF
    + PRIV.PRIV_CREATE_DOMAIN
    + PRIV.PRIV_CREATE_FILE
    + PRIV.PRIV_DELETE_FILE_SELF;

// [10, 1] means that people whose rank is less than 1% will get Level 10
export const LEVELS = [
    [10, 1],
    [9, 2],
    [8, 10],
    [7, 20],
    [6, 30],
    [5, 40],
    [4, 70],
    [3, 90],
    [2, 95],
    [1, 100],
];

export const BUILTIN_USERS: Udoc[] = [
    {
        _id: 0,
        mail: 'Guest@hydro.local',
        mailLower: 'guest@hydro.local',
        uname: 'Guest',
        unameLower: 'guest',
        salt: '',
        hash: '',
        hashType: 'hydro',
        regat: new Date(0),
        regip: '127.0.0.1',
        loginat: new Date(0),
        loginip: '127.0.0.1',
        priv: PRIV.PRIV_REGISTER_USER,
    },
    {
        _id: 1,
        mail: 'Hydro@hydro.local',
        mailLower: 'hydro@hydro.local',
        uname: 'Hydro',
        unameLower: 'hydro',
        salt: '',
        hash: '',
        hashType: 'hydro',
        regat: new Date(0),
        regip: '127.0.0.1',
        loginat: new Date(0),
        loginip: '127.0.0.1',
        priv: PRIV.PRIV_USER_PROFILE,
    },
];

export const BUILTIN_ROLES = {
    guest: PERM.PERM_BASIC,
    default: PERM.PERM_DEFAULT,
    admin: PERM.PERM_ADMIN,
};

export const DEFAULT_NODES = {
    探索: [
        { pic: 'qa', name: '问答' },
        { pic: 'share', name: '分享' },
        { pic: 'solution', name: '题解' },
    ],
    Hydro: [
        { pic: 'hydro', name: 'Hydro' },
        { pic: null, name: '团队' },
        { pic: null, name: '月赛' },
        { pic: 'advice', name: '建议' },
    ],
    数据结构: [
        { pic: null, name: '散列表' },
        { pic: null, name: '搜索树' },
        { pic: null, name: '栈和队列' },
        { pic: null, name: '图' },
        { pic: null, name: '堆' },
    ],
    算法: [
        { pic: null, name: '数论' },
        { pic: null, name: '几何' },
        { pic: null, name: '图论' },
        { pic: null, name: '网络流' },
        { pic: null, name: '动态规划' },
        { pic: null, name: '背包' },
        { pic: null, name: '排序' },
        { pic: null, name: '搜索' },
        { pic: null, name: '并查集' },
        { pic: null, name: '贪心' },
        { pic: null, name: '博弈论' },
    ],
    在线题库: [
        { pic: null, name: 'CodeForces' },
        { pic: null, name: 'TopCoder' },
        { pic: null, name: 'POJ' },
        { pic: null, name: 'BZOJ' },
        { pic: null, name: 'USACO' },
        { pic: null, name: 'RQNOJ' },
        { pic: null, name: 'UOJ' },
        { pic: null, name: 'LOJ' },
        { pic: null, name: '洛谷' },
    ],
    泛: [
        { pic: null, name: '数学' },
        { pic: null, name: '编程' },
        { pic: null, name: '数据库' },
        { pic: null, name: 'C' },
        { pic: null, name: 'C++' },
        { pic: null, name: 'Pascal' },
        { pic: null, name: 'Java' },
        { pic: null, name: 'PHP' },
        { pic: null, name: 'Python' },
        { pic: null, name: '游戏' },
        { pic: null, name: '保送' },
        { pic: null, name: 'ACM' },
    ],
};

export const CATEGORIES = {
    动态规划: [
        'LCS',
        'LIS',
        '背包',
        '单调性DP',
        '环形DP',
        '树形DP',
        '状态压缩DP',
    ],
    搜索: [
        '枚举',
        '搜索与剪枝',
        '启发式搜索',
        'DLX',
        '双向搜索',
        '折半搜索',
        '记忆化搜索',
        '模拟退火',
    ],
    计算几何: [
        '半平面交',
        '凸包',
        '几何图形的交与并',
        '旋转卡壳',
        '点定位',
        '坐标变换',
        '离散化与扫描',
        '反演',
        'Voronoi图',
        '平面图的对偶图',
        '三角剖分',
        '梯形剖分',
        '几何知识',
    ],
    贪心: [],
    树结构: [
        '最近公共祖先',
        '生成树',
        'DFS序列',
        '树上倍增',
        '树的分治',
        '树链剖分',
        'Link-Cut-Tree',
    ],
    图结构: [
        '平面图',
        '二分图',
        '二分图匹配',
        '最短路',
        '差分约束',
        '拓扑排序',
        '网络流',
        '强连通分量',
        '割点割边',
        '欧拉回路',
        '2-SAT',
    ],
    数论: [
        '素数判定',
        '欧几里得算法',
        '不定方程',
        '数位统计',
        '解线性同余方程',
        'baby-step-giant-step',
        'Pell方程',
        '大整数质因数分解',
        '勾股方程',
        '积性函数',
        'Fibonacci数列',
    ],
    模拟: [],
    数据结构: [
        '栈',
        '队列',
        '链表',
        '单调队列',
        '并查集',
        '堆',
        '平衡树',
        '线段树',
        '树状数组',
        '树套树',
        '四分树',
        '划分树',
        '归并树',
        'k-d树',
        '块状链表',
        'Hashing',
        '函数式编程',
    ],
    博弈论: [],
    字符串: [
        'KMP',
        '后缀数据结构',
        'Trie树',
        'AC自动机',
        'Manacher',
        '表达式处理',
        '最小表示法',
    ],
    组合数学: [
        '生成函数',
        '容斥原理',
        '康托展开',
        'Catalan数列',
        'Stirling数',
        '差分',
        'Polya定理',
    ],
    线性代数: [
        '矩阵乘法',
        '高斯消元',
        '线性规划',
    ],
    高精度: [
        'FFT',
    ],
    递推: [],
    概率论: [
        '随机化',
    ],
    NPC: [],
    其他: [
        '二分查找',
        '三分查找',
        '双指针扫描',
        '分治',
        '分块',
        'RMQ',
        '快速幂',
        '数学',
        '排序',
        '构造',
    ],
};

export const LANG_TEXTS = {
    c: 'C',
    cc: 'C++',
    cs: 'C#',
    pas: 'Pascal',
    java: 'Java',
    py: 'Python',
    py3: 'Python 3',
    php: 'PHP',
    rs: 'Rust',
    hs: 'Haskell',
    js: 'JavaScript',
    go: 'Go',
    rb: 'Ruby',
};

export const STATUS = {
    STATUS_WAITING: 0,
    STATUS_ACCEPTED: 1,
    STATUS_WRONG_ANSWER: 2,
    STATUS_TIME_LIMIT_EXCEEDED: 3,
    STATUS_MEMORY_LIMIT_EXCEEDED: 4,
    STATUS_OUTPUT_LIMIT_EXCEEDED: 5,
    STATUS_RUNTIME_ERROR: 6,
    STATUS_COMPILE_ERROR: 7,
    STATUS_SYSTEM_ERROR: 8,
    STATUS_CANCELED: 9,
    STATUS_ETC: 10,
    STATUS_HACKED: 11,
    STATUS_JUDGING: 20,
    STATUS_COMPILING: 21,
    STATUS_FETCHED: 22,
    STATUS_IGNORED: 30,
};

export const STATUS_TEXTS = {
    [STATUS.STATUS_WAITING]: 'Waiting',
    [STATUS.STATUS_ACCEPTED]: 'Accepted',
    [STATUS.STATUS_WRONG_ANSWER]: 'Wrong Answer',
    [STATUS.STATUS_TIME_LIMIT_EXCEEDED]: 'Time Exceeded',
    [STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: 'Memory Exceeded',
    [STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED]: 'Output Exceeded',
    [STATUS.STATUS_RUNTIME_ERROR]: 'Runtime Error',
    [STATUS.STATUS_COMPILE_ERROR]: 'Compile Error',
    [STATUS.STATUS_SYSTEM_ERROR]: 'System Error',
    [STATUS.STATUS_CANCELED]: 'Cancelled',
    [STATUS.STATUS_ETC]: 'Unknown Error',
    [STATUS.STATUS_HACKED]: 'Hacked',
    [STATUS.STATUS_JUDGING]: 'Running',
    [STATUS.STATUS_COMPILING]: 'Compiling',
    [STATUS.STATUS_FETCHED]: 'Fetched',
    [STATUS.STATUS_IGNORED]: 'Ignored',
};

export const STATUS_CODES = {
    0: 'pending',
    1: 'pass',
    2: 'fail',
    3: 'fail',
    4: 'fail',
    5: 'fail',
    6: 'fail',
    7: 'fail',
    8: 'fail',
    9: 'ignored',
    10: 'fail',
    11: 'fail',
    20: 'progress',
    21: 'progress',
    22: 'progress',
    30: 'ignored',
};

export const USER_GENDER_MALE = 0;
export const USER_GENDER_FEMALE = 1;
export const USER_GENDER_OTHER = 2;
export const USER_GENDERS = [USER_GENDER_MALE, USER_GENDER_FEMALE, USER_GENDER_OTHER];
export const USER_GENDER_RANGE = {
    [USER_GENDER_MALE]: 'Boy ♂',
    [USER_GENDER_FEMALE]: 'Girl ♀',
    [USER_GENDER_OTHER]: 'Other',
};
export const USER_GENDER_ICONS = {
    [USER_GENDER_MALE]: '♂',
    [USER_GENDER_FEMALE]: '♀',
    [USER_GENDER_OTHER]: '?',
};

global.Hydro.model.builtin = {
    Permission,
    PERM,
    PERMS,
    PERMS_BY_FAMILY,
    PRIV,
    LEVELS,
    BUILTIN_USERS,
    BUILTIN_ROLES,
    DEFAULT_NODES,
    CATEGORIES,
    LANG_TEXTS,
    STATUS,
    STATUS_TEXTS,
    STATUS_CODES,
    USER_GENDER_MALE,
    USER_GENDER_FEMALE,
    USER_GENDER_OTHER,
    USER_GENDERS,
    USER_GENDER_RANGE,
    USER_GENDER_ICONS,
};
