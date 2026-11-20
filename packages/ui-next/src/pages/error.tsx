import { usePageData } from '../context/page-data';

export default function ErrorPage() {
  const { args: { error } } = usePageData();
  return <div role="alert">{error.message || 'Something went wrong.'}</div>;
}
