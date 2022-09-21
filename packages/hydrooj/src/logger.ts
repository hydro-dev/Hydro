import { Logger } from '@hydrooj/utils/lib/logger';
export { Logger } from '@hydrooj/utils/lib/logger';

global.Hydro.Logger = Logger;
export const logger = new Logger('*');
global.Hydro.logger = logger;
