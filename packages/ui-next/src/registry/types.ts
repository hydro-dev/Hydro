type Scope = 'page' | 'component' | 'layout' | string;
export type SlotName = `${Scope}:${string}`;

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
