declare global {
  interface Window {
    node_modules: any;
    LANGS: Record<string, any>;

  }

  let UserContext: Record<string, any>;
  let UiContext: Record<string, any>;
}

export { };
