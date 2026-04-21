import { usePageData } from '../context/pageData';

export function useRouteMap(): Record<string, string> {
  const data = usePageData();
  return data.routeMap;
}
