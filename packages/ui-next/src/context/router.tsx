/* eslint-disable react-refresh/only-export-components */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { isSameOrigin } from '../utils/url';
import { type PageData, useSetPageData } from './page-data';

interface InternalState {
  status: 'idle' | 'loading' | 'error';
  error: Error | null;
}

type RouterAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS' }
  | { type: 'FETCH_ERROR', error: Error }
  | { type: 'FETCH_ABORT' };

function routerReducer(state: InternalState, action: RouterAction): InternalState {
  switch (action.type) {
    case 'FETCH_START': return { status: 'loading', error: null };
    case 'FETCH_SUCCESS': return { status: 'idle', error: null };
    case 'FETCH_ERROR': return { status: 'error', error: action.error };
    case 'FETCH_ABORT': return state;
    default: return state;
  }
}

export interface RouterState {
  loading: boolean;
  error: Error | null;
}

interface RouterNavigateContextValue {
  navigate: (url: string) => Promise<void>;
}

const RouterStateContext = createContext<RouterState | null>(null);
const RouterNavigateContext = createContext<RouterNavigateContextValue | null>(null);

export const RouterProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [state, dispatch] = useReducer(routerReducer, { status: 'idle', error: null });
  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0);
  const setData = useSetPageData();

  const fetchPage = useCallback(
    async (url: string) => {
      abortRef.current?.abort();
      const gen = ++genRef.current;
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ type: 'FETCH_START' });

      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'x-hydro-inject': 'uicontext,usercontext',
          },
        });
        if (res.redirected) {
          window.location.href = res.url;
          return false;
        }
        if (!res.ok) throw new Error(`Navigation failed: ${res.status} ${res.statusText}`);
        const body = await res.json();
        const pageName = res.headers.get('x-hydro-page') || '';
        console.log('[Hydro] data from', url, 'received:', body, 'pageName:', pageName);

        // If a newer fetch has started, ignore this result
        if (gen !== genRef.current) return false;

        setData((prev) => (body.HYDRO_INJECTED ? body : { ...prev, ...body }));
        dispatch({ type: 'FETCH_SUCCESS' });
        return true;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          dispatch({ type: 'FETCH_ABORT' });
          console.log('[Hydro] navigation to', url, 'aborted');
          return false;
        }

        const err = e instanceof Error ? e : new Error(String(e));
        console.error('[Hydro] navigation error:', err);

        if (gen !== genRef.current) return false;

        dispatch({ type: 'FETCH_ERROR', error: err });
        window.location.href = url;
        return false;
      }
    },
    [setData],
  );

  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      const url: string =
        (e.state as { url?: string } | null)?.url
        ?? window.location.pathname + window.location.search;
      fetchPage(url);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [fetchPage]);

  const stateValue = useMemo(
    () => ({ loading: state.status === 'loading', error: state.error }),
    [state.status, state.error],
  );
  const navigate = useCallback(async (url: string) => {
    if (!isSameOrigin(url)) {
      window.location.href = url;
      return;
    }
    const ok = await fetchPage(url);
    if (ok) history.pushState({ url }, '', url);
  }, [fetchPage]);

  const navigateValue = useMemo<RouterNavigateContextValue>(() => ({ navigate }), [navigate]);

  return (
    <RouterNavigateContext.Provider value={navigateValue}>
      <RouterStateContext.Provider value={stateValue}>
        {children}
      </RouterStateContext.Provider>
    </RouterNavigateContext.Provider>
  );
};

export function useRouterState(): RouterState {
  const ctx = useContext(RouterStateContext);
  if (!ctx) throw new Error('useRouterState must be used within RouterProvider');
  return ctx;
}

export function useNavigate(): (url: string) => Promise<void> {
  const ctx = useContext(RouterNavigateContext);
  if (!ctx) throw new Error('useNavigate must be used within RouterProvider');
  return ctx.navigate;
}
