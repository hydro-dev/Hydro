import { UiContextBase } from 'hydrooj/dist/service/server';
import * as system from 'hydrooj/dist/model/system';

declare module 'hydrooj/dist/service/server' {
    interface UiContextBase {
        onlyofficeApi: string;
    }
}
UiContextBase.onlyofficeApi = system.get('onlyoffice.api');
