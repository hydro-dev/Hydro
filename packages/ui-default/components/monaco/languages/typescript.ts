import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

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
