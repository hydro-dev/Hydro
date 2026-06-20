import { store } from './store';

export type LayoutComponent = React.ComponentType<React.PropsWithChildren>;

export function registerLayout(name: string, Comp: LayoutComponent) {
  store.setDefault(`layout:${name}` as `layout:${string}`, Comp);
}
