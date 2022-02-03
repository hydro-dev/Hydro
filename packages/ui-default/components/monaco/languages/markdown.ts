import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import list from 'emojis-list';
import keyword from 'emojis-keywords';
import api, { gql } from 'vj/utils/api';

const qqEmojies = [
  'weixiao',
  'piezui',
  'se',
  'fadai',
  'deyi',
  'liulei',
  'haixiu',
  'bizui',
  'shui',
  'daku',
  'ganga',
  'fanu',
  'tiaopi',
  'ciya',
  'jingya',
  'nanguo',
  'ku',
  'lenghan',
  'zhuakuang',
  'tu',
  'touxiao',
  'keai',
  'baiyan',
  'aoman',
  'jie',
  'kun',
  'jingkong',
  'liuhan',
  'hanxiao',
  'dabing',
  'fendou',
  'zhouma',
  'yiwen',
  'xu',
  'yun',
  'zhemo',
  'shuai',
  'kulou',
  'qiaoda',
  'zaijian',
  'cahan',
  'koubi',
  'guzhang',
  'qiudale',
  'huaixiao',
  'zuohengheng',
  'youhengheng',
  'haqian',
  'bishi',
  'weiqu',
  'kuaikule',
  'yinxian',
  'qinqin',
  'xia',
  'kelian',
  'caidao',
  'xigua',
  'pijiu',
  'lanqiu',
  'pingpang',
  'kafei',
  'fan',
  'zhutou',
  'meigui',
  'diaoxie',
  'shiai',
  'aixin',
  'xinsui',
  'dangao',
  'shandian',
  'zhadan',
  'dao',
  'zuqiu',
  'piaochong',
  'bianbian',
  'yueliang',
  'taiyang',
  'liwu',
  'yongbao',
  'qiang',
  'ruo',
  'woshou',
  'shengli',
  'baoquan',
  'gouyin',
  'quantou',
  'chajin',
  'aini',
  'NO',
  'OK',
  'aiqing',
  'feiwen',
  'tiaotiao',
  'fadou',
  'ouhuo',
  'zhuanquan',
  'ketou',
  'huitou',
  'tiaosheng',
  'huishou',
  'jidong',
  'jiewu',
  'xianwen',
  'zuotaiji',
  'youtaiji',
  'shuangxi',
  'bianpao',
  'denglong',
  'facai',
  'Kge',
  'gouwu',
  'youjian',
  'shuai',
  'hecai',
  'qidao',
  'baojin',
  'bangbangtang',
  'henai',
  'xiamian',
  'xiangjiao',
  'feiji',
  'kaiche',
  'zuochetou',
  'chexiang',
  'youchetou',
  'duoyun',
  'xiayu',
  'chaopiao',
  'xiongmao',
  'dengpao',
  'fengche',
  'naozhong',
  'dasan',
  'caiqiu',
  'zuanjie',
  'shafa',
  'zhijin',
  'yao',
  'shouqiang',
  'qingwa',
];
const idMap = [
  14, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 0, 50, 51, 96, 53, 54, 73, 74, 75, 76, 77, 78, 55, 56,
  57, 58, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108,
  109, 110, 111, 112, 32, 113, 114, 115, 63, 64, 59, 33, 34, 116, 36, 37, 38, 91, 92, 93, 29, 117, 72, 45,
  42, 39, 62, 46, 47, 71, 95, 118, 119, 120, 121, 122, 123, 124, 27, 21, 23, 25, 26, 125, 126, 127, 128,
  129, 130, 131, 132, 133, 134, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150,
  151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170,
];

function emoji(range) {
  return keyword.map((i, index) => ({
    label: `${list[index]} ${i}`,
    kind: monaco.languages.CompletionItemKind.Keyword,
    documentation: i,
    insertText: list[index],
    range,
  }));
}

function qqEmoji(range) {
  return qqEmojies.map((i, index) => ({
    label: `/${i}`,
    kind: monaco.languages.CompletionItemKind.Keyword,
    documentation: { value: `![${i}](//qq-face.vercel.app/gif/s${idMap[index]}.gif)`, isTrusted: true },
    insertText: `![${i}](//qq-face.vercel.app/gif/s${idMap[index]}.gif =32x32) `,
    range,
  }));
}

monaco.editor.registerCommand('hydro.openUserPage', (accesser, uid) => {
  window.open(`/user/${uid}`);
});

monaco.languages.registerCodeLensProvider('markdown', {
  async provideCodeLenses(model) {
    const users = model.findMatches('\\[\\]\\(/user/(\\d+)\\)', true, true, true, null, true);
    if (!users.length) {
      return {
        lenses: [],
        dispose: () => { },
      };
    }
    const { data } = await api(gql`
      users(ids: ${users.map((i) => +i.matches[1])}) {
        _id
        uname
      }
    `);
    return {
      lenses: users.map((i, index) => ({
        range: i.range,
        id: `${index}.${i.matches[1]}`,
        command: {
          id: 'hydro.openUserPage',
          arguments: [i.matches[1]],
          title: `@${data.users.find((doc) => doc._id.toString() === i.matches[1])?.uname || i.matches[1]}`,
        },
      })),
      dispose: () => { },
    };
  },
  resolveCodeLens(model, codeLens) {
    return codeLens;
  },
});

monaco.languages.registerCompletionItemProvider('markdown', {
  async provideCompletionItems(model, position) {
    const word = model.getWordAtPosition(position);
    if (word.word.length < 2) return { suggestions: [] };
    const prefix = model.getValueInRange({
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn - 1,
      endColumn: word.startColumn,
    });
    if (![':', '/', '@'].includes(prefix)) return { suggestions: [] };
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn - 1,
      endColumn: word.endColumn,
    };
    if (prefix === '@') {
      const users = await api(gql`
        users(search: ${word.word}) {
          _id
          uname
          avatarUrl
          priv
        }
      `, ['data', 'users']);
      return {
        suggestions: users.map((i) => ({
          label: { label: `@${i.uname}`, description: `UID=${i._id}` },
          kind: monaco.languages.CompletionItemKind.Property,
          documentation: { value: `[](#loader) ![avatar](${i.avatarUrl})`, isTrusted: true },
          insertText: `@[](/user/${i._id}) `,
          range,
          sortText: i.priv === 0 ? '0' : '1',
          tags: i.priv === 0 ? [1] : [],
        })),
      };
    }
    return {
      suggestions: prefix === ':' ? emoji(range) : qqEmoji(range),
    };
  },
});
