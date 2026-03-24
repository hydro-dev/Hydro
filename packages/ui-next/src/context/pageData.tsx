import { createContext, type ReactNode, useContext, useState } from 'react';

export interface PageData {
  name: string;
  args: Record<string, any>;
  url: string;
  [key: string]: any;
}

interface PageDataContextValue {
  data: PageData;
  setData: (data: PageData) => void;
}

const PageDataContext = createContext<PageDataContextValue | null>(null);

export function PageDataProvider({ initial, children }: { initial: PageData, children: ReactNode }) {
  const [data, setData] = useState<PageData>(initial);
  return (
    <PageDataContext.Provider value={{ data, setData }}>
      {children}
    </PageDataContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePageData(): PageData {
  const ctx = useContext(PageDataContext);
  if (!ctx) throw new Error('usePageData must be used within PageDataProvider');
  return ctx.data;
}
