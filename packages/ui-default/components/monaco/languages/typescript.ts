import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

const types = require.context('!!raw-loader!@types/node/', true, /\.d\.ts$/);

const diagnosticsOptions = {
  noSemanticValidation: false,
  noSyntaxValidation: false,
};
const compilerOptions = {
  target: monaco.languages.typescript.ScriptTarget.ES2020,
  module: monaco.languages.typescript.ModuleKind.ESNext,
  allowNonTsExtensions: true,
};
monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
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
  monaco.languages.typescript.javascriptDefaults.addExtraLib(val, uri);
  monaco.editor.createModel(val, 'typescript', monaco.Uri.parse(uri));
}
console.log(types);
