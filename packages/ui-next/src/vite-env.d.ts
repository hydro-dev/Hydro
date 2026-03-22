/// <reference types="vite/client" />

declare module 'virtual:hydro-plugins' {
    import type { Context } from './context';
    const plugins: Array<{ apply: (ctx: Context) => void }>;
    export default plugins;
}
