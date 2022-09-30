import { SystemModel, UiContextBase } from 'hydrooj';

declare module 'hydrooj' {
    interface UiContextBase {
        onlyofficeApi?: string;
    }
}
UiContextBase.onlyofficeApi = SystemModel.get('onlyoffice.api');
