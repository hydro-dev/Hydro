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

interface PageDataContextValue {
  data: PageData;
  setData: React.Dispatch<React.SetStateAction<PageData>>;
}

const PageDataContext = createContext<PageDataContextValue | null>(null);

interface PageDataProviderProps {
  initial: PageData;
  children: ReactNode;
}

export function PageDataProvider({ initial, children }: PageDataProviderProps) {
  const [data, setData] = useState<PageData>(initial);
  const value = useMemo(() => ({ data, setData }), [data]);

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

export function useSetPageData(): React.Dispatch<React.SetStateAction<PageData>> {
  return usePageDataContext().setData;
}
