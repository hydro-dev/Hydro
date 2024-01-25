import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

const types = require.context('@types/node/', true, /\.d\.ts$/, 'lazy-once');

const diagnosticsOptions: monaco.languages.typescript.DiagnosticsOptions = {
  noSemanticValidation: false,
  noSyntaxValidation: false,
  noSuggestionDiagnostics: true,
};
const compilerOptions: monaco.languages.typescript.CompilerOptions = {
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
const modules = [];

export async function loadTypes() {
  for (const key of types.keys()) {
    if (!key.startsWith('.')) continue;
    const m = await types(key);
    const val = m.replace('declare var require: NodeRequire;', '');
    if (val.includes('declare module ')) {
      modules.push(val.toString().split('declare module \'')[1].split('\'')[0]);
    }
    const uri = `ts:node/${key.split('./')[1]}`;
    monaco.languages.typescript.javascriptDefaults.addExtraLib(val, uri);
    monaco.editor.createModel(val, 'typescript', monaco.Uri.parse(uri));
  }
  let val = 'declare var require:';
  for (const m of modules) val += `((id:'${m}')=>(typeof import('${m}')))&`;
  val += '((id:string)=>any)';
  monaco.languages.typescript.javascriptDefaults.addExtraLib(val, 'ts:node/require.d.ts');
  monaco.editor.createModel(val, 'typescript', monaco.Uri.parse('ts:node/require.d.ts'));
}
