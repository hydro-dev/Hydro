import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

const types = require.context('!!raw-loader!@types/node/', true, /\.d\.ts$/);

monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: false,
  noSyntaxValidation: false,
});
monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
  target: monaco.languages.typescript.ScriptTarget.ES2020,
  allowNonTsExtensions: true,
});
const libSource = [
  'declare function readline(): string;',
  'declare function print(content: string): void;',
].join('\n');

const libUri = 'ts:filename/basic.d.ts';
monaco.languages.typescript.javascriptDefaults.addExtraLib(libSource, libUri);
monaco.editor.createModel(libSource, 'typescript', monaco.Uri.parse(libUri));
for (const key of types.keys()) {
  const val = types(key).default;
  const uri = `ts:node/${key.split('./')[1]}`;
  console.log(val, uri);
  monaco.languages.typescript.javascriptDefaults.addExtraLib(val, uri);
  monaco.editor.createModel(val, 'typescript', monaco.Uri.parse(uri));
}
console.log(types);
