import { usePageData } from './context/page-data';
import { Component } from './registry';

const AppInner = Component('page:app', () => {
  const data = usePageData();

  return <div>app, page:{data.name}</div>;
});

export default AppInner;
