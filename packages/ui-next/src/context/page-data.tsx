/* eslint-disable react-refresh/only-export-components */

import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

export interface PageData {
  HYDRO_INJECTED?: boolean;
  name: string;
  args: Record<string, any>;
  url: string;
  routeMap: Record<string, string>;
  [key: string]: any;
}

type PageDataSetter = React.Dispatch<React.SetStateAction<PageData>>;

interface PageDataContextValue {
  data: PageData;
  setData: PageDataSetter;

  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;

  error: Error | null;
  setError: React.Dispatch<React.SetStateAction<Error | null>>;
}
const PageDataContext = createContext<PageDataContextValue | null>(null);

interface PageDataProviderProps {
  initial: PageData;
  children: ReactNode;
}

export function PageDataProvider({ initial, children }: PageDataProviderProps) {
  const [data, setData] = useState<PageData>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const value = useMemo(() => ({ data, setData, loading, setLoading, error, setError }), [data, loading, error]);

  return <PageDataContext.Provider value={value}>{children}</PageDataContext.Provider>;
}

function usePageDataContext(): PageDataContextValue {
  const ctx = useContext(PageDataContext);
  if (!ctx) throw new Error('usePageData must be used within PageDataProvider');
  return ctx;
}

export function usePageData(): PageData {
  return usePageDataContext().data;
}

export interface NavigationState {
  loading: PageDataContextValue['loading'];
  error: PageDataContextValue['error'];
}

export function useNavigationState(): NavigationState {
  const { loading, error } = usePageDataContext();
  return { loading, error };
}

export function useNavigationControls() {
  const { setData, setLoading, setError } = usePageDataContext();
  return { setData, setLoading, setError };
}
