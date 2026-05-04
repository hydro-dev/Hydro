import { store } from './store';
import type { Interceptor, InterceptorOptions, SlotName } from './types';

export function intercept<P = any>(
  name: SlotName,
  interceptor: Interceptor<P>,
  opts?: InterceptorOptions,
): () => void {
  return store.addInterceptor(name, interceptor, opts);
}

/** default priority: -100 */
export function before<P extends Record<string, any> = Record<string, any>>(
  name: SlotName,
  Comp: React.FC<P>,
  opts?: InterceptorOptions,
): () => void {
  return intercept<P>(
    name,
    (props, next) => (
      <>
        <Comp {...props} />
        {next()}
      </>
    ),
    { priority: -100, ...opts },
  );
}

/** default priority: 100 */
export function after<P extends Record<string, any> = Record<string, any>>(
  name: SlotName,
  Comp: React.FC<P>,
  opts?: InterceptorOptions,
): () => void {
  return intercept<P>(
    name,
    (props, next) => (
      <>
        {next()}
        <Comp {...props} />
      </>
    ),
    { priority: 100, ...opts },
  );
}

/** default priority: -50 */
export function patch<P = any>(
  name: SlotName,
  patcher: (props: P) => Partial<P>,
  opts?: InterceptorOptions,
): () => void {
  return intercept<P>(
    name,
    (props, next) => next(patcher(props)),
    { priority: -50, ...opts },
  );
}

/** default priority: 0 */
export function replace<P extends Record<string, any> = Record<string, any>>(
  name: SlotName,
  Replacement: React.FC<P>,
  opts?: { id?: string, priority?: number },
): () => void {
  return intercept<P>(
    name,
    (props, _next) => <Replacement {...props} />,
    { priority: 0, ...opts },
  );
}

/** default priority: -10 */
export function wrap<P extends Record<string, any> = Record<string, any>>(
  name: SlotName,
  Wrapper: React.FC<{ children: React.ReactNode } & P>,
  opts?: InterceptorOptions,
): () => void {
  return intercept<P>(
    name,
    (props, next) => <Wrapper {...props}>{next()}</Wrapper>,
    { priority: -10, ...opts },
  );
}
