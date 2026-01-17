import type { JSONSchema7 } from 'json-schema';

export const testlibCheckers = [
  'acmp', 'caseicmp', 'casencmp', 'casewcmp', 'dcmp', 'fcmp', 'hcmp',
  'icmp', 'lcmp', 'ncmp', 'nyesno', 'pointscmp', 'pointsinfo',
  'rcmp', 'rcmp4', 'rcmp6', 'rcmp9', 'rncmp', 'uncmp', 'wcmp', 'yesno',
];

const problemConfigSchema: JSONSchema7 = {
  type: 'object',
  definitions: {
    cases: { type: 'array', items: { $ref: '#/definitions/case' } },
    case: {
      type: 'object',
      properties: {
        input: { type: 'string' },
        output: { type: 'string' },
        time: { $ref: '#/definitions/time' },
        memory: { $ref: '#/definitions/memory' },
        score: { $ref: '#/definitions/score', description: 'score' },
      },
      required: ['input'],
      additionalProperties: false,
    },
    subtask: {
      description: 'Subtask Info',
      type: 'object',
      properties: {
        type: { enum: ['min', 'max', 'sum'] },
        time: { $ref: '#/definitions/time' },
        memory: { $ref: '#/definitions/memory' },
        score: { $ref: '#/definitions/score', description: 'score' },
        cases: { $ref: '#/definitions/cases' },
        if: { type: 'array', items: { type: 'integer' } },
        id: { type: 'integer' },
      },
      required: ['score'],
      additionalProperties: false,
    },
    time: { type: 'string', pattern: '^([1-9][0-9]*(?:\\.[0-9]+)?|0\\.[0-9]*[1-9][0-9]*)([mu]?)s?$' },
    memory: { type: 'string', pattern: '^([1-9][0-9]*(?:\\.[0-9]+)?|0\\.[0-9]*[1-9][0-9]*)([kKmMgG])[bB]?$' },
    score: { type: 'integer', maximum: 100, minimum: 1 },
    rateConfig: {
      type: 'object',
      patternProperties: {
        '^.+$': {
          type: 'number',
        },
      },
    },
    compilableFile: {
      oneOf: [
        { type: 'string', pattern: '\\.' },
        {
          type: 'object',
          properties: {
            file: { type: 'string', pattern: '\\.' },
            lang: { type: 'string' },
          },
          required: ['file', 'lang'],
          additionalProperties: false,
        },
      ],
    },
  },
  properties: {
    redirect: { type: 'string', pattern: '[0-9a-zA-Z_-]+\\/[0-9]+' },
    key: { type: 'string', pattern: '[0-9a-f]{32}' },
    type: { enum: ['default', 'interactive', 'communication', 'submit_answer', 'objective', 'remote_judge'] },
    subType: { type: 'string' },
    langs: { type: 'array', items: { type: 'string' } },
    target: { type: 'string' },
    checker_type: { enum: ['default', 'lemon', 'syzoj', 'hustoj', 'testlib', 'strict', 'qduoj', 'kattis'] },
    checker: {
      oneOf: [
        { type: 'string', enum: testlibCheckers },
        { $ref: '#/definitions/compilableFile' },
      ],
    },
    interactor: { $ref: '#/definitions/compilableFile' },
    manager: { $ref: '#/definitions/compilableFile' },
    num_processes: { type: 'number', minimum: 1, maximum: 5 },
    validator: { $ref: '#/definitions/compilableFile' },
    user_extra_files: { type: 'array', items: { type: 'string' } },
    judge_extra_files: { type: 'array', items: { type: 'string' } },
    cases: { $ref: '#/definitions/cases' },
    subtasks: { type: 'array', items: { $ref: '#/definitions/subtask' } },
    filename: { type: 'string' },
    detail: { type: 'string', enum: ['full', 'case', 'none'] },
    time: { $ref: '#/definitions/time' },
    memory: { $ref: '#/definitions/memory' },
    score: { $ref: '#/definitions/score' },
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
    answers: {
      type: 'object',
      patternProperties: {
        '^\\d+(-\\d+)?$': {
          type: 'array',
          minLength: 2,
          maxLength: 2,
        },
      },
      additionalProperties: false,
    },
    time_limit_rate: { $ref: '#/definitions/rateConfig' },
    memory_limit_rate: { $ref: '#/definitions/rateConfig' },
  },
  additionalProperties: false,
};

export default problemConfigSchema;
