import {
  after, before, Component, patch,
} from '../registry';

export interface Context {
  before: typeof before;
  after: typeof after;
  patch: typeof patch;
  register: typeof Component;
}

export function createContext(): Context {
  return {
    before, after, patch, register: Component,
  };
}
