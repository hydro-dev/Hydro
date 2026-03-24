import { usePageData } from './context/pageData';
import { Component } from './registry';

const AppInner = Component('page:app', () => {
  const data = usePageData();

  return <div>app, page:{data.name}</div>;
});

export default AppInner;
