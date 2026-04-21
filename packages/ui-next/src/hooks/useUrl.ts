import { compile } from 'path-to-regexp';
import { useCallback } from 'react';
import { useRouteMap } from './useRouteMap';

function buildUrl(pattern: string, params: Record<string, string> = {}): string {
  try {
    return compile(pattern)(params);
  } catch (err) {
    console.warn(`[Hydro] Failed to build URL for pattern "${pattern}":`, err);
    return '#';
  }
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
