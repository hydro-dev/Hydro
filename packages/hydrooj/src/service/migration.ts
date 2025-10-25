/* eslint-disable no-await-in-loop */
import cac from 'cac';
import { Logger } from '@hydrooj/utils';
import { Context, Service } from '../context';
import system from '../model/system';

const argv = cac().parse();

export type MigrationScript = null | ((ctx: Context) => Promise<boolean | void>);
const logger = new Logger('migration');

declare module '../context' {
    interface Context {
        migration: MigrationService;
    }
}

export default class MigrationService extends Service {
    private channels: Record<string, MigrationScript[]> = {};
    private called = false;

    constructor(ctx: Context) {
        super(ctx, 'migration');
    }

    async registerChannel(name: string, s: MigrationScript[]) {
        if (this.called) logger.warn('MigrationService.registerChannel: called after doUpgrade with name: %s', name);
        this.channels[name] = s;
    }

    dontWait(func: () => Promise<void | boolean>, name: string) {
        (func as any).dontWait = name;
        return func;
    }

    async doUpgrade() {
        this.called = true;
        for (const channel in this.channels) {
            const name = `db.ver${channel === 'hydrooj' ? '' : `-${channel}`}`;
            let dbVer = system.get(name) ?? 0;
            const scripts = this.channels[channel];
            const isFresh = !dbVer;
            const expected = scripts.length;
            if (isFresh) {
                await scripts[0]?.(this.ctx);
                await system.set(name, expected);
                continue;
            }
            let upgraded = false;
            if (dbVer > expected) {
                logger.warn('Current database version for [%s] is %d, expected %d.', channel, dbVer, expected);
                logger.warn('You are likely trying to apply a downgrade.');
                logger.warn('This version of Hydro is not compatible with newer data version.');
                if (!argv.options.ignoreVersion) {
                    logger.warn('To prevent data corruption, the startup has been aborted.');
                    logger.warn('If you want to continue, use --ignore-version on startup.');
                    logger.warn('Do it at your own risk.');
                    await new Promise(() => { });
                }
            }
            while (dbVer < expected) {
                const func = scripts[dbVer];
                if (typeof func !== 'function') {
                    dbVer++;
                    continue;
                }
                logger.info('Upgrading database [%s]: from %d to %d', channel, dbVer, expected);
                if ('dontWait' in func) {
                    logger.info('[Background Task]');
                    // For those scripts we don't really care if they fail
                    func(this.ctx).then(() => {
                        logger.info('Background Task Completed [%s]: from %d to %d', channel, func.dontWait, expected);
                    }).catch(logger.error);
                } else {
                    const result = await func(this.ctx);
                    if (!result) break;
                }
                dbVer++;
                await system.set(name, dbVer);
                upgraded = true;
            }
            if (upgraded) logger.success('Database upgraded [%s]: current version %d', channel, dbVer);
        }
    }
}
