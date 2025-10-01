import keyword from 'emojis-keywords';
import list from 'emojis-list';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import qface from 'qface';
import { api } from 'vj/utils';

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
  return qface.data.flatMap((i) => {
    const url = qface.getUrl(i.QSid, 'https://koishi.js.org/QFace');
    return [i.QDes.substring(1), ...(i.Input || [])].map((input) => ({
      label: `/${input}`,
      kind: monaco.languages.CompletionItemKind.Keyword,
      documentation: { value: `![${i.QDes}](${url})`, isTrusted: true },
      insertText: `![${i.Input ? i.Input[0] : i.QDes.substring(1)}](${url} =32x32) `,
      range,
    }));
  });
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
    const data = await api('users', { ids: users.map((i) => +i.matches[1]) }, ['_id', 'uname']);
    return {
      lenses: users.map((i, index) => ({
        range: i.range,
        id: `${index}.${i.matches[1]}`,
        command: {
          id: 'hydro.openUserPage',
          arguments: [i.matches[1]],
          title: `@${data.find((doc) => doc._id.toString() === i.matches[1])?.uname || i.matches[1]}`,
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
      const users = await api('users', { search: word.word }, ['_id', 'uname']);
      return {
        suggestions: users.map((i) => ({
          label: { label: `@${i.uname}`, description: `UID=${i._id}` },
          kind: monaco.languages.CompletionItemKind.Property,
          documentation: { value: `[](#loader) ![avatar](${new URL(i.avatarUrl, window.location.href)})`, isTrusted: true },
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
