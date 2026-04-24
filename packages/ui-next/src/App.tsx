import { Link } from './components/link';
import { usePageData } from './context/page-data';
import { Component } from './registry';

const AppInner = Component('page:app', () => {
  const data = usePageData();

  return (
    <>
      <div>app, page:{data.name}</div>
      <div>
        <Link to="homepage">homepage</Link> <Link to="problem_main">problem_main</Link>
      </div>
    </>
  );
});

export default AppInner;
