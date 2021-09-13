import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

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
    key: { type: 'string', pattern: '[0-9a-f]{32}' },
    type: { enum: ['default', 'interactive', 'submit_answer', 'objective', 'remote_judge'] },
    subType: { type: 'string' },
    langs: { type: 'array', items: { type: 'string' } },
    target: { type: 'string' },
    checker_type: { enum: ['default', 'lemon', 'syzoj', 'hustoj', 'testlib', 'strict', 'qduoj'] },
    checker: { type: 'string', pattern: '\\.' },
    interactor: { type: 'string', pattern: '\\.' },
    user_extra_files: { type: 'array', items: { type: 'string' } },
    judge_extra_files: { type: 'array', items: { type: 'string' } },
    cases: { $ref: '#/def/cases' },
    subtasks: { type: 'array', items: { $ref: '#/def/subtask' } },
    filename: { type: 'string' },
    detail: { type: 'boolean' },
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

// @ts-ignore
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
