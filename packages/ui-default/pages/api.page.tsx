import 'graphiql/src/css/doc-explorer.css';

import type { GraphQLSchema } from 'graphql';
import { load as loadYaml } from 'js-yaml';
import type * as monaco from 'monaco-editor';
import type { SchemaConfig } from 'monaco-graphql/src/typings';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NamedPage } from 'vj/misc/Page';
import request from 'vj/utils/request';

const defaultQuery = `\
query Example(
  $name: String!
) {
  user(uname: $name) {
    _id
    uname
  }
}`;
const variablesString = 'name: Hydro';
const resultsString = '{}';
const schemaSdlString = `\
"""
Loading schema...
"""`;

const page = new NamedPage('api', async () => {
  const [{ DocExplorer }, { buildClientSchema, getIntrospectionQuery, printSchema }, { load }] = await Promise.all([
    import('graphiql/esm/components/DocExplorer'),
    import('graphql/utilities'),
    import('vj/components/monaco/loader'),
  ]);
  const { monaco } = await load(['graphql', 'json', 'yaml']);
  const { initializeMode } = await import('monaco-graphql/esm/initializeMode');

  const variablesModel = monaco.editor.createModel(
    variablesString,
    'yaml',
    monaco.Uri.file('/1/variables.yaml'),
  );
  const variablesEditor = monaco.editor.create(
    document.getElementById('variables') as HTMLElement,
    {
      model: variablesModel,
      language: 'yaml',
      formatOnPaste: true,
      formatOnType: true,
      comments: {
        insertSpace: true,
        ignoreEmptyLines: true,
      },
    },
  );

  const operationModel = monaco.editor.createModel(
    defaultQuery,
    'graphql',
    monaco.Uri.file('/1/operation.graphql'),
  );
  const operationEditor = monaco.editor.create(
    document.getElementById('operation') as HTMLElement,
    {
      model: operationModel,
      formatOnPaste: true,
      formatOnType: true,
      folding: true,
      language: 'graphql',
    },
  );

  const schemaModel = monaco.editor.createModel(
    schemaSdlString,
    'graphql',
    monaco.Uri.file('/1/schema.graphqls'),
  );
  const schemaEditor = monaco.editor.create(
    document.getElementById('schema-sdl') as HTMLElement,
    {
      model: schemaModel,
      formatOnPaste: true,
      formatOnType: true,
      folding: true,
      readOnly: true,
      language: 'graphql',
    },
  );

  const resultsModel = monaco.editor.createModel(
    resultsString,
    'json',
    monaco.Uri.file('/1/results.json'),
  );
  const resultsEditor = monaco.editor.create(
    document.getElementById('results') as HTMLElement,
    {
      model: resultsModel,
      language: 'json',
      wordWrap: 'on',
      readOnly: true,
      showFoldingControls: 'always',
    },
  );

  const monacoGraphQLAPI = initializeMode({
    formattingOptions: {
      prettierConfig: {
        printWidth: 120,
      },
    },
  });

  const toolbar = $('#toolbar')!;
  toolbar.html();
  const executeOpButton = $('<button id="execute-op">Run Operation ➤</button>');
  toolbar.append(executeOpButton);

  const operationUri = operationModel.uri.toString();
  let schema: SchemaConfig;
  let clientSchema: GraphQLSchema;
  try {
    const { data } = await request.post('/api?schema', {
      query: getIntrospectionQuery(),
      operationName: 'IntrospectionQuery',
    });
    clientSchema = buildClientSchema(data);
    schema = {
      introspectionJSON: data,
      documentString: printSchema(clientSchema),
      uri: monaco.Uri.parse('/api?schema').toString(),
    };
  } catch {
    schemaModel.setValue('"""\nFailed to load schema.\n"""');
  }
  monacoGraphQLAPI.setSchemaConfig([
    { ...schema, fileMatch: [operationUri, schemaModel.uri.toString()] },
  ]);
  schemaEditor.setValue(schema.documentString || '');

  const operationHandler = async () => {
    try {
      resultsEditor.setValue(JSON.stringify({ message: 'Executing...' }, null, 2));
      const result = await request.post('/api?schema', {
        query: operationEditor.getValue(),
        variables: loadYaml(variablesEditor.getValue()),
      });
      resultsEditor.setValue(JSON.stringify(result, null, 2));
    } catch (err) {
      if (err instanceof Error) {
        resultsEditor.setValue(err.toString());
      }
    }
  };
  executeOpButton.on('click', operationHandler);
  executeOpButton.on('touchend', operationHandler);
  const opAction: monaco.editor.IActionDescriptor = {
    id: 'graphql-run',
    label: 'Run Operation',
    contextMenuOrder: 0,
    contextMenuGroupId: 'graphql',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
    run: operationHandler,
  };
  operationEditor.addAction(opAction);
  variablesEditor.addAction(opAction);
  resultsEditor.addAction(opAction);

  createRoot(document.getElementById('docs')).render(<DocExplorer schema={clientSchema} />);
});

export default page;
