import { Logger } from '@hydrooj/utils/lib/utils';
export { Logger } from '@hydrooj/utils/lib/utils';

global.Hydro.Logger = Logger;
export const logger = new Logger('*');
global.Hydro.logger = logger;
