import * as system from 'hydrooj/src/model/system';
import { UiContextBase } from 'hydrooj/src/service/layers/base';

declare module 'hydrooj/src/service/layers/base' {
    interface UiContextBase {
        onlyofficeApi?: string;
    }
}
UiContextBase.onlyofficeApi = system.get('onlyoffice.api');
