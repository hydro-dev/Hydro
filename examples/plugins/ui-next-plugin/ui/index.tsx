import type { PluginAPI } from '@hydrooj/ui-next';

export function setup(api: PluginAPI) {
    // (2) Page registration — slot names match the server route names / template stems
    // registered in ../index.ts. Pages are lazy-loaded on demand.
    api.registerPage('example_home', () => import('./pages/example_home'));
    api.registerPage('example_css', () => import('./pages/example_css'));
}
