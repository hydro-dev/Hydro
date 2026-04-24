import { usePageData } from '../context/page-data';

export function useRouteMap(): Record<string, string> {
  const data = usePageData();
  return data.routeMap;
}
