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
  'no',
  'ok',
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
    documentation: `![${i}](//qq-face.vercel.app/gif/s${index}.gif)`,
    insertText: `![${i}](//qq-face.vercel.app/gif/s${index}.gif =32x32) `,
    range,
  }));
}

monaco.editor.registerCommand('hydro.openUserPage', (accesser, uid) => {
  window.open(`/user/${uid}`);
});

monaco.languages.registerCodeLensProvider('markdown', {
  async provideCodeLenses(model) {
    const users = model.findMatches('\\[\\]\\(/user/(\\d+)\\)', true, true, true, null, true);
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
          label: `@${i.uname} (UID=${i._id})`,
          kind: monaco.languages.CompletionItemKind.Property,
          documentation: { value: `![monaco_avatar](${i.avatarUrl})`, isTrusted: true },
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
