import type { LayoutComponent } from './layout';

type AppScope = 'app';
type PageScope = 'page';
type LayoutScope = 'layout';
type ComponentScope = 'component';
type Scope = AppScope | PageScope | LayoutScope | ComponentScope | string;

export interface PageModule<P = any> {
  default: React.ComponentType<P>;
}
export type PageLoader<P = any> = () => Promise<PageModule<P>>;
export interface PageEntry<P = any> {
  Page: React.LazyExoticComponent<React.ComponentType<P>>;
  layout: string;
}
export interface RegisterPageOptions {
  /** Layout key registered via `registerLayout`. Defaults to `default`. */
  layout?: string;
}

export type AppSlotName = `${AppScope}:${string}`;
export type PageSlotName = `${PageScope}:${string}`;
export type LayoutSlotName = `${LayoutScope}:${string}`;
export type ComponentSlotName = `${ComponentScope}:${string}`;
export type SlotName = `${Scope}:${string}`;
export type SlotValue<N extends SlotName> =
  N extends PageSlotName ? PageEntry
    : N extends LayoutSlotName ? LayoutComponent
      : N extends ComponentSlotName ? React.FC<any>
        : React.FC<any>;

export type Interceptor<P = any> = (
  props: P,
  next: (overrideProps?: Partial<P>) => React.ReactNode,
) => React.ReactNode;
export interface InterceptorOptions {
  id?: string;
  /** 越小越靠外，越先执行 */
  priority?: number;
}
export interface InterceptorEntry<P = any> {
  id: string;
  /** 越小越靠外，越先执行 */
  priority: number;
  interceptor: Interceptor<P>;
}
