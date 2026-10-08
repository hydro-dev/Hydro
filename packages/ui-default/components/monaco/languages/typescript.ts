import * as monaco from 'monaco-editor/editor';
import type { CompilerOptions, DiagnosticsOptions } from 'monaco-editor/languages/features/typescript/register.js';
import {
  javascriptDefaults, ModuleKind, ModuleResolutionKind, ScriptTarget,
  typescriptDefaults } from 'monaco-editor/languages/features/typescript/register.js';

const types = require.context('@types/node/', true, /\.d\.ts$/, 'lazy-once');

const diagnosticsOptions: DiagnosticsOptions = {
  noSemanticValidation: false,
  noSyntaxValidation: false,
  noSuggestionDiagnostics: true,
};
const compilerOptions: CompilerOptions = {
  target: ScriptTarget.ES2020,
  module: ModuleKind.ESNext,
  allowNonTsExtensions: true,
};
javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
javascriptDefaults.setCompilerOptions(compilerOptions);
typescriptDefaults.setCompilerOptions(compilerOptions);
const libSource = [
  'declare function readline(): string;',
  'declare function print(content: string): void;',
].join('\n');
const libUri = 'ts:filename/basic.d.ts';
javascriptDefaults.addExtraLib(libSource, libUri);
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
    javascriptDefaults.addExtraLib(val, uri);
    monaco.editor.createModel(val, 'typescript', monaco.Uri.parse(uri));
  }
  let val = 'declare var require:';
  for (const m of modules) val += `((id:'${m}')=>(typeof import('${m}')))&`;
  val += '((id:string)=>any)';
  javascriptDefaults.addExtraLib(val, 'ts:node/require.d.ts');
  monaco.editor.createModel(val, 'typescript', monaco.Uri.parse('ts:node/require.d.ts'));
}

export {
  javascriptDefaults, ModuleKind, ModuleResolutionKind, ScriptTarget, typescriptDefaults,
};
