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

/** @type {Record<string, import('json-schema').JSONSchema7Definition>} */
const problemConfigSchemaDef = {
  cases: { type: 'array', items: { $ref: '#/def/case' } },
  case: {
    type: 'object',
    properties: {
      input: { type: 'string' },
      output: { type: 'string' },
    },
    required: ['input'],
    additionalProperties: false,
  },
  subtask: {
    description: 'Subtask Info',
    type: 'object',
    properties: {
      type: { enum: ['min', 'max', 'sum'] },
      time: { $ref: '#/def/time' },
      memory: { $ref: '#/def/memory' },
      score: { $ref: '#/def/score', description: 'score' },
      cases: { $ref: '#/def/cases' },
      if: { type: 'array', items: { type: 'integer' } },
      id: { type: 'integer' },
    },
    required: ['score'],
    additionalProperties: false,
  },
  time: { type: 'string', pattern: '^([0-9]+(?:\\.[0-9]*)?)([mu]?)s?$' },
  memory: { type: 'string', pattern: '^([0-9]+(?:\\.[0-9]*)?)([kmg])b?$' },
  score: { type: 'integer', maximum: 100, minimum: 1 },
};

/** @type {import('json-schema').JSONSchema7Definition} */
const problemConfigSchema = {
  type: 'object',
  def: problemConfigSchemaDef,
  properties: {
    type: { enum: ['default', 'interactive', 'submit_answer', 'subjective'] },
    checker_type: { enum: ['default', 'lemon', 'syzoj', 'testlib', 'strict', 'qduoj'] },
    checker: { type: 'string', pattern: '\\.' },
    interactor: { type: 'string', pattern: '\\.' },
    user_extra_files: { type: 'array', items: { type: 'string' } },
    judge_extra_files: { type: 'array', items: { type: 'string' } },
    cases: { $ref: '#/def/cases' },
    subtasks: { type: 'array', items: { $ref: '#/def/subtask' } },
    filename: { type: 'string' },
    time: { $ref: '#/def/time' },
    memory: { $ref: '#/def/memory' },
    score: { $ref: '#/def/score' },
    template: {
      type: 'object',
      patternProperties: {
        '^.*$': {
          type: 'array',
          minLength: 2,
          maxLength: 2,
          items: { type: 'string' },
        },
      },
      additionalProperties: false,
    },
    outputs: {
      type: 'array',
      minLength: 1,
    },
  },
  additionalProperties: false,
};

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
      schema: problemConfigSchema,
    },
  ],
});

export default monaco;
