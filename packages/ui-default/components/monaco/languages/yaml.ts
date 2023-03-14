import { setDiagnosticsOptions } from 'monaco-yaml';
import problemConfigSchema from '../schema/problemconfig';

setDiagnosticsOptions({
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
    {
      uri: new URL('/manage/config/schema.json', window.location.href).toString(),
      fileMatch: ['hydro://system/setting.yaml'],
    },
  ],
});
