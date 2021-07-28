import { UiContextBase } from 'hydrooj/src/service/server';
import * as system from 'hydrooj/src/model/system';

declare module 'hydrooj/src/service/server' {
    interface UiContextBase {
        onlyofficeApi: string;
    }
}
UiContextBase.onlyofficeApi = system.get('onlyoffice.api');
