import { compile } from 'path-to-regexp';
import { useCallback } from 'react';
import { useUiContext } from '@/context/page-data';
import { useRouteMap } from './use-route-map';

export interface UrlParams {
  [key: string]: string;
}

export function useBuildUrl() {
  const routeMap = useRouteMap();
  const { domainId, domainHost = [] } = useUiContext();

  const getPrefix = useCallback((id?: string) => {
    id ||= domainId;
    const currentHost = window.location.host;
    return id === (domainHost.includes(currentHost) ? domainId : 'system') ? '' : `/d/${id}`;
  }, [domainId, domainHost]);

  return useCallback((name: string, params: UrlParams = {}, searchParams: Record<string, string> = {}): string => {
    const pattern = routeMap[name];
    if (!pattern) {
      console.warn(`[Hydro] Unknown route: ${name}`);
      return '#';
    }

    const { domainId: paramDomainId, ...routeParams } = params;

    try {
      const prefix = getPrefix(paramDomainId);
      const path = compile(pattern)(routeParams);
      const search = new URLSearchParams(searchParams).toString();
      if (prefix) return `${prefix}${path}${search ? `?${search}` : ''}`;
      return `${path}${search ? `?${search}` : ''}`;
    } catch (e) {
      console.error(`[Hydro] Failed to build URL for route "${name}":`, e);
      return '#';
    }
  }, [routeMap, getPrefix]);
}
