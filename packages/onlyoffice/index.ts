import { Context, SystemModel, UiContextBase } from 'hydrooj';

declare module 'hydrooj' {
    interface UiContextBase {
        onlyofficeApi?: string;
    }
}

export function apply(ctx: Context) {
    Object.defineProperty(UiContextBase, 'onlyofficeApi', {
        configurable: true,
        enumerable: true,
        get() {
            return SystemModel.get('onlyoffice.api');
        },
    });
    ctx.on('dispose', () => {
        Object.defineProperty(UiContextBase, 'onlyofficeApi', {
            enumerable: false,
        });
    });
}
