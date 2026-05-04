/// <reference types="vite/client" />

declare module 'virtual:hydro-plugins' {
    import type { PluginDefinition } from './registry';
    const plugins: PluginDefinition[];
    export default plugins;
}
