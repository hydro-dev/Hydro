/// <reference types="vite/client" />

declare module 'virtual:hydro-plugins' {
    import type { RegistryContext } from './registry';
    const plugins: Array<{ apply: (ctx: RegistryContext) => void }>;
    export default plugins;
}
