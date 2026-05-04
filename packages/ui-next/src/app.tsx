import { Link } from './components/link';
import { usePageData } from './context/page-data';
import { before, defineSlot } from './registry';

const AppInner = defineSlot('page:app', () => {
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

before('page:app', () => {
  console.log('before app');
  return (
    <>
      <div>before app</div>
    </>
  );
});

export default AppInner;
