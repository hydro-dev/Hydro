import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

export interface PageData {
  HYDRO_INJECTED?: boolean;
  name: string;
  args: Record<string, any>;
  url: string;
  routeMap: Record<string, string>;
  [key: string]: any;
}

type PageDataSetter = (data: PageData) => void;

interface PageDataContextValue {
  data: PageData;
  setData: PageDataSetter;
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

// eslint-disable-next-line react-refresh/only-export-components
export function usePageData(): PageData {
  const ctx = useContext(PageDataContext);
  if (!ctx) throw new Error('usePageData must be used within PageDataProvider');
  return ctx.data;
}
