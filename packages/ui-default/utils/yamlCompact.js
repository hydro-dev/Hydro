// eslint-disable-next-line import/no-unresolved
import yaml, { Schema } from 'real-js-yaml';

Schema.create = (arg1, arg2) => new Schema(arg1, arg2);

// eslint-disable-next-line import/no-unresolved
export * from 'real-js-yaml';
export default yaml;
