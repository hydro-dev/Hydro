import { SlotErrorBoundary } from './error-boundary';
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
  const label = `before:${Comp.displayName || Comp.name || '?'}`;
  return intercept<P>(
    name,
    (props, next) => (
      <>
        <SlotErrorBoundary slotName={name} label={label}>
          <Comp {...props} />
        </SlotErrorBoundary>
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
  const label = `after:${Comp.displayName || Comp.name || '?'}`;
  return intercept<P>(
    name,
    (props, next) => (
      <>
        {next()}
        <SlotErrorBoundary slotName={name} label={label}>
          <Comp {...props} />
        </SlotErrorBoundary>
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
  const label = `replace:${Replacement.displayName || Replacement.name || '?'}`;
  return intercept<P>(
    name,
    (props, _next) => (
      <SlotErrorBoundary slotName={name} label={label}>
        <Replacement {...props} />
      </SlotErrorBoundary>
    ),
    { priority: 0, ...opts },
  );
}

/** default priority: -10 */
export function wrap<P extends Record<string, any> = Record<string, any>>(
  name: SlotName,
  Wrapper: React.FC<{ children: React.ReactNode } & P>,
  opts?: InterceptorOptions,
): () => void {
  const label = `wrap:${Wrapper.displayName || Wrapper.name || '?'}`;
  return intercept<P>(
    name,
    (props, next) => (
      <SlotErrorBoundary slotName={name} label={label}>
        <Wrapper {...props}>{next()}</Wrapper>
      </SlotErrorBoundary>
    ),
    { priority: -10, ...opts },
  );
}
