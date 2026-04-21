import { useCallback } from 'react';
import { useRouteMap } from './useRouteMap';

function buildUrl(pattern: string, params: Record<string, string> = {}): string {
  let url = pattern;
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`:${key}`, encodeURIComponent(value));
  }
  return url;
}

export function useUrl() {
  const routeMap = useRouteMap();

  const url = useCallback((name: string, params: Record<string, string> = {}): string => {
    const pattern = routeMap[name];
    if (!pattern) {
      console.warn(`[Hydro] Unknown route: ${name}`);
      return '#';
    }
    return buildUrl(pattern, params);
  }, [routeMap]);

  return url;
}
