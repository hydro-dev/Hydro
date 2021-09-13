import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import list from 'emojis-list';
import keyword from 'emojis-keywords';

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
    documentation: `/${i}`,
    insertText: `![${i}](//qq-face.vercel.app/gif/s${index}.gif =32x32) `,
    range,
  }));
}

monaco.languages.registerCompletionItemProvider('markdown', {
  provideCompletionItems(model, position) {
    const word = model.getWordAtPosition(position);
    const prefix = model.getValueInRange({
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn - 1,
      endColumn: word.startColumn - 1,
    });
    if (![':', '/'].includes(prefix)) return { suggestions: [] };
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn - 1,
      endColumn: word.endColumn,
    };
    return {
      suggestions: prefix === ':' ? emoji(range) : qqEmoji(range),
    };
  },
});
