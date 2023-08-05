import { setDiagnosticsOptions } from 'monaco-yaml';
import problemConfigSchema from '../schema/problemconfig';

setDiagnosticsOptions({
  validate: true,
  enableSchemaRequest: true,
  hover: true,
  completion: true,
  format: false,
  schemas: [
    {
      uri: 'https://hydro.js.org/schema/problemConfig.json',
      fileMatch: ['hydro://problem/file/config.yaml'],
      schema: problemConfigSchema as any,
    },
    {
      uri: new URL('/manage/config/schema.json', window.location.href).toString(),
      fileMatch: ['hydro://system/setting.yaml'],
    },
  ],
});
