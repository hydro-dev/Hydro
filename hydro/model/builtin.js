const perm = require('../permission');
const BUILTIN_USERS = [
    {
        _id: 0,
        uname: 'Hydro',
        unameLower: 'hydro',
        email: '',
        emailLower: '',
        salt: '',
        hash: '',
        gender: 'other',
        regat: new Date(),
        regip: '127.0.0.1',
        gravatar: '',
        loginat: new Date(),
        loginip: '127.0.0.1',
        role: 'guest'
    },
    {
        _id: 1,
        email: 'guest@hydro',
        emailLower: 'guest@hydro',
        uname: 'Guest',
        unameLower: 'guest',
        hash: '',
        salt: '',
        regat: new Date(),
        regip: '127.0.0.1',
        loginat: new Date(),
        loginip: '127.0.0.1',
        gravatar: 'guest@hydro',
        role: 'guest'
    }
];
const BUILTIN_ROLES = [
    { _id: 'guest', perm: perm.PERM_BASIC },
    { _id: 'default', perm: perm.PERM_DEFAULT },
    { _id: 'admin', perm: perm.PERM_ADMIN }
];
const CATEGORIES = {
    '动态规划': [
        'LCS',
        'LIS',
        '背包',
        '单调性DP',
        '环形DP',
        '树形DP',
        '状态压缩DP'
    ],
    '搜索': [
        '枚举',
        '搜索与剪枝',
        '启发式搜索',
        'DLX',
        '双向搜索',
        '折半搜索',
        '记忆化搜索',
        '模拟退火'
    ],
    '计算几何': [
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
        '几何知识'
    ],
    '贪心': [],
    '树结构': [
        '最近公共祖先',
        '生成树',
        'DFS序列',
        '树上倍增',
        '树的分治',
        '树链剖分',
        'Link-Cut-Tree'
    ],
    '图结构': [
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
        '2-SAT'
    ],
    '数论': [
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
        'Fibonacci数列'
    ],
    '模拟': [],
    '数据结构': [
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
        '函数式编程'
    ],
    '博弈论': [],
    '字符串': [
        'KMP',
        '后缀数据结构',
        'Trie树',
        'AC自动机',
        'Manacher',
        '表达式处理',
        '最小表示法'
    ],
    '组合数学': [
        '生成函数',
        '容斥原理',
        '康托展开',
        'Catalan数列',
        'Stirling数',
        '差分',
        'Polya定理'
    ],
    '线性代数': [
        '矩阵乘法',
        '高斯消元',
        '线性规划'
    ],
    '高精度': [
        'FFT'
    ],
    '递推': [],
    '概率论': [
        '随机化'
    ],
    'NPC': [],
    '其他': [
        '二分查找',
        '三分查找',
        '双指针扫描',
        '分治',
        '分块',
        'RMQ',
        '快速幂',
        '数学',
        '排序',
        '构造'
    ]
};
const FOOTER_EXTRA_HTMLS = [];
const VIEW_LANGS = [
    { code: 'zh-CN', name: 'zh-CN' }
];
const LANGS = [
    { id: 'cc', name: 'cpp' }
];
const LANG_TEXTS = {
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
const LANG_HIGHLIGHT_ID = {
    c: 'c',
    cc: 'cpp',
    cs: 'csharp',
    pas: 'pascal',
    java: 'java',
    py: 'python',
    py3: 'python',
    php: 'php',
    rs: 'rust',
    hs: 'haskell',
    js: 'javascript',
    go: 'go',
    rb: 'ruby',
};
module.exports = {
    BUILTIN_USERS, BUILTIN_ROLES, CATEGORIES, VIEW_LANGS, FOOTER_EXTRA_HTMLS, LANGS,
    LANG_TEXTS, LANG_HIGHLIGHT_ID
};