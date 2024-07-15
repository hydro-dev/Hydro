import 'vscode/localExtensionHost';

import keyword from 'emojis-keywords';
import list from 'emojis-list';
import qface from 'qface';
import * as vscode from 'vscode';

vscode.commands.registerCommand('hydro.openUserPage', (accesser, uid) => {
  window.open(`/user/${uid}`);
});

class CodelensProvider implements vscode.CodeLensProvider {
  private regex: RegExp;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    this.regex = /\[\]\(\/user\/(\d+)\)/g;
    console.log('aaa', vscode);

    vscode.workspace.onDidChangeConfiguration((_) => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  public async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken) {
    const codeLenses: vscode.CodeLens[] = [];
    console.log('cl', 123);
    const regex = new RegExp(this.regex);
    const text = document.getText();
    let matches;
    const users = [];
    // eslint-disable-next-line no-cond-assign
    while ((matches = regex.exec(text)) !== null) {
      const line = document.lineAt(document.positionAt(matches.index).line);
      const indexOf = line.text.indexOf(matches[0]);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));
      if (range) users.push({ matches, range });
    }
    //     const { data } = await api(gql`
    //     users(ids: ${users.map((i) => +i.matches[1])}) {
    //       _id
    //       uname
    //     }
    //   `);
    // eslint-disable-next-line @typescript-eslint/no-shadow
    for (const { matches, range } of users) {
      codeLenses.push(new vscode.CodeLens(range, {
        command: 'hydro.openUserPage',
        arguments: [matches[1]],
        title: `@${matches[1]}`,
      }));
    }

    return codeLenses;
  }

  public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken) {
    return codeLens;
  }
}
vscode.languages.registerCodeLensProvider({ language: 'markdown' }, new CodelensProvider());

vscode.languages.registerCompletionItemProvider({ language: 'markdown' }, {
  async provideCompletionItems(document, position, token, context) {
    const range = new vscode.Range(new vscode.Position(position.line, position.character - 1), position);
    return context.triggerCharacter === ':'
      ? keyword.map((i, index) => {
        const c = new vscode.CompletionItem(`${list[index]} ${i}`, vscode.CompletionItemKind.Keyword);
        c.insertText = list[index];
        c.documentation = i;
        c.range = range;
        return c;
      })
      : qface.data.flatMap((i) => {
        const url = qface.getUrl(i.QSid, 'https://qq-face.vercel.app');
        return [i.QDes.substring(1), ...(i.Input || [])].map((input) => {
          const c = new vscode.CompletionItem(`/${input}`, vscode.CompletionItemKind.Keyword);
          c.insertText = `![${i.Input ? i.Input[0] : i.QDes.substring(1)}](${url} =32x32) `;
          c.documentation = new vscode.MarkdownString(`![${i.QDes}](${url})`);
          c.range = range;
          return c;
        });
      });
  },
}, ':', '/');

vscode.languages.registerCompletionItemProvider('*', {
  async provideCompletionItems(document, position, token, context) {
    return [];
    const range = document.getWordRangeAtPosition(position);
    const word = document.getText(range);
    if (word.length < 2) return [];
    // const prefix = document.getValueInRange({
    //     startLineNumber: position.lineNumber,
    //     endLineNumber: position.lineNumber,
    //     startColumn: word.startColumn - 1,
    //     endColumn: word.startColumn,
    // });
    // if (![':', '/', '@'].includes(prefix)) return { suggestions: [] };
    // const range = {
    //     startLineNumber: position.lineNumber,
    //     endLineNumber: position.lineNumber,
    //     startColumn: word.startColumn - 1,
    //     endColumn: word.endColumn,
    // };
    //     if (prefix === '@') {
    //         const users = await api(gql`
    //     users(search: ${word.word}) {
    //       _id
    //       uname
    //       avatarUrl
    //       priv
    //     }
    //   `, ['data', 'users']);
    //         return {
    //             suggestions: users.map((i) => ({
    //                 label: { label: `@${i.uname}`, description: `UID=${i._id}` },
    //                 kind: monaco.languages.CompletionItemKind.Property,
    //                 documentation: { value: `[](#loader) ![avatar](${new URL(i.avatarUrl, window.location.href)})`, isTrusted: true },
    //                 insertText: `@[](/user/${i._id}) `,
    //                 range,
    //                 sortText: i.priv === 0 ? '0' : '1',
    //                 tags: i.priv === 0 ? [1] : [],
    //             })),
    //         };
    //     }
    // return {
    //     suggestions: prefix === ':' ? emoji(range) : qqEmoji(range),
    // };
  },
}, '@');
