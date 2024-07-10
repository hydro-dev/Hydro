/* eslint-disable no-await-in-loop */
import { Logger } from '@hydrooj/utils';
import { Context, Service } from '../context';
import * as system from '../model/system';

export type MigrationScript = null | (() => Promise<boolean | void>);
const logger = new Logger('migration');

declare module '../context' {
    interface Context {
        migration: MigrationService;
    }
}

export default class MigrationService extends Service {
    private channels: Record<string, MigrationScript[]> = {};

    constructor(ctx: Context) {
        super(ctx, 'migration', true);
    }

    async registerChannel(name: string, s: MigrationScript[]) {
        this.channels[name] = s;
    }

    async doUpgrade() {
        for (const channel in this.channels) {
            const name = `db.ver${channel === 'hydrooj' ? '' : `-${channel}`}`;
            let dbVer = system.get(name) ?? 0;
            const scripts = this.channels[channel];
            const isFresh = !dbVer;
            const expected = scripts.length;
            if (isFresh) {
                await scripts[0]?.();
                await system.set(name, expected);
                continue;
            }
            while (dbVer < expected) {
                const func = scripts[dbVer];
                if (typeof func !== 'function') {
                    dbVer++;
                    continue;
                }
                logger.info('Upgrading database [%s]: from %d to %d', channel, dbVer, expected);
                const result = await func();
                if (!result) break;
                dbVer++;
                await system.set(name, dbVer);
            }
        }
    }
}
