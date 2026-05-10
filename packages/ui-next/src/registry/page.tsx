import React, { lazy } from 'react';
import Layout from '../components/layout';
import { store } from './store';

interface PageModule<P = any> {
  default: React.ComponentType<P>;
  Layout?: React.ComponentType<React.PropsWithChildren>;
}

type PageLoader<P = any> = () => Promise<PageModule<P>>;

export function registerPage<P = any>(name: string, loader: PageLoader<P>) {
  store.setDefault(`page:${name}`, lazy(() =>
    loader().then((mod) => {
      const PageComp = mod.default;
      const LayoutComp = mod.Layout || Layout;
      return {
        default(props: React.PropsWithChildren<P>) {
          return (
            <LayoutComp>
              <PageComp {...props} />
            </LayoutComp>
          );
        },
      };
    }),
  ));
}
