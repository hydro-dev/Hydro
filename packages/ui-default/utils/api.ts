import request from './request';

export default async (q: string, path: string[] = []) => {
  let query = q.trim();
  if (!query.startsWith('query')) query = `query{${query}}`;
  const res = await request.post(`/d/${UiContext.domainId}/api`, { query });
  if (res.errors) throw new Error(res.errors[0].message);
  let cursor = res;
  for (const p of path) {
    cursor = cursor[p];
    if (!cursor) return undefined;
  }
  return cursor;
};

export const gql = (
  pieces: TemplateStringsArray,
  ...templates: (string | number | string[] | number[])[]
) => {
  let res = '';
  for (let i = 0; i < pieces.length; i++) {
    res += pieces[i];
    if (templates[i]) res += JSON.stringify(templates[i]);
  }
  return res;
};
