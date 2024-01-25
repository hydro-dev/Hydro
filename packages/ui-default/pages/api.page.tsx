import { pick } from 'lodash';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NamedPage } from 'vj/misc/Page';
import { request } from 'vj/utils';

const defaultQuery = `\
query Example(
  $name: String!
) {
  user(uname: $name) {
    _id
    uname
  }
}`;

export default new NamedPage('api', async () => {
  const { GraphiQL } = await import('graphiql');
  GraphiQL.Logo = function () {
    return <p></p>;
  } as any;
  createRoot(document.getElementById('main')!).render(
    <GraphiQL
      fetcher={(body, opts = {}) => request.post('/api', body, pick(opts, 'headers'))}
      defaultQuery={defaultQuery}
      variables='{"name": "Hydro"}'
    />,
  );
});
