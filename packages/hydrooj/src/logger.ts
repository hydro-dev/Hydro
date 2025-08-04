import { Logger } from '@hydrooj/utils/lib/utils';
export { Logger } from '@hydrooj/utils/lib/utils';

globalThis.Hydro.Logger = Logger;
export const logger = new Logger('*');
globalThis.Hydro.logger = logger;
