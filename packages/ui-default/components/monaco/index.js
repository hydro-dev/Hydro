import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: false,
  noSyntaxValidation: false,
});
monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
  target: monaco.languages.typescript.ScriptTarget.ES6,
  allowNonTsExtensions: true,
});
const libSource = [
  'declare function readline(): string;',
  'declare function print(content: string): void;',
].join('\n');
const libUri = 'ts:filename/basic.d.ts';
monaco.languages.typescript.javascriptDefaults.addExtraLib(libSource, libUri);
monaco.editor.createModel(libSource, 'typescript', monaco.Uri.parse(libUri));
monaco.languages.yaml.yamlDefaults.setDiagnosticsOptions({
  validate: true,
  enableSchemaRequest: true,
  hover: true,
  completion: true,
  format: true,
  schemas: [
    {
      uri: 'https://hydro.js.org/schema/problemConfig.json',
      fileMatch: ['hydro://problem/file/config.yaml'],
      schema: {
        type: 'object',
        def: {
          cases: { type: 'array', items: { $ref: '#/def/case' } },
          case: {
            type: 'object',
            properties: {
              input: { type: 'string' },
              output: { type: 'string' },
            },
            required: ['input'],
          },
          subtask: {
            description: 'Subtask Info',
            type: 'object',
            properties: {
              time: { $ref: '#/def/time' },
              memory: { $ref: '#/def/memory' },
              score: { $ref: '#/def/score', description: 'score' },
              cases: { $ref: '#/def/cases' },
              if: { type: 'array', items: { type: 'integer' } },
            },
          },
          time: { type: 'string', pattern: '^([0-9]+(?:\\.[0-9]*)?)([mu]?)s?$' },
          memory: { type: 'string', pattern: '^([0-9]+(?:\\.[0-9]*)?)([kmg])b?$' },
          score: { type: 'integer', maximum: 100, minimum: 1 },
        },
        properties: {
          type: { enum: ['default', 'interactive', 'submit_answer', 'subjective'] },
          checker_type: { enum: ['default', 'lemon', 'syzoj', 'testlib', 'strict', 'qduoj'] },
          checker: { type: 'string', pattern: '\\.' },
          interactor: { type: 'string', pattern: '\\.' },
          user_extra_files: { type: 'array', items: { type: 'string' } },
          judge_extra_files: { type: 'array', items: { type: 'string' } },
          cases: { $ref: '#/def/cases' },
          subtasks: { type: 'array', items: { $ref: '#/def/subtask' } },
          outputs: { type: 'array' },
          filename: { type: 'string' },
          time: { $ref: '#/def/time' },
          memory: { $ref: '#/def/memory' },
          score: { $ref: '#/def/score' },
        },
      },
    },
  ],
});

export default monaco;
