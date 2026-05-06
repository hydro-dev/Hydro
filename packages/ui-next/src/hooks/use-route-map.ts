import { useSyncExternalStore } from 'react';
import { routeMapStore } from '../globals';

export function useRouteMap() {
  return useSyncExternalStore(routeMapStore.subscribe, routeMapStore.getSnapshot);
}
