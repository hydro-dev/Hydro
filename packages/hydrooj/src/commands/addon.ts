import child from 'child_process';
import os from 'os';
import path from 'path';
import { CAC } from 'cac';
import fs from 'fs-extra';
import { Logger } from '@hydrooj/utils';
import { getAddons, writeAddons } from '../options';

const logger = new Logger('addon');
const addonDir = path.resolve(os.homedir(), '.hydro', 'addons');

export function register(cli: CAC) {
    cli.command('addon [operation] [name]').action((operation, name) => {
        if (operation && !['add', 'remove', 'create', 'list'].includes(operation)) {
            console.log('Unknown operation.');
            return;
        }
        let addons = getAddons();
        if (operation === 'create') {
            const dir = `${addonDir}/${name || 'addon'}`;
            fs.mkdirSync(dir, { recursive: true });
            child.execSync('yarn init -y', { cwd: dir });
            fs.mkdirSync(`${dir}/templates`);
            fs.mkdirSync(`${dir}/locales`);
            fs.mkdirSync(`${dir}/public`);
            fs.mkdirSync(`${dir}/frontend`);
            fs.symlinkSync(dir, path.resolve(os.homedir(), name || 'addon'), 'dir');
            addons.push(dir);
            logger.success(`Addon created at ${dir}`);
        } else if (operation && name) {
            for (let i = 0; i < addons.length; i++) {
                if (addons[i] === name) {
                    addons.splice(i, 1);
                    break;
                }
            }
        }

        if (operation === 'add' && name) {
            try {
                require.resolve(`${name}/package.json`);
            } catch (e) {
                logger.error(`Addon not found or not available: ${name}`);
                return;
            }
            addons.push(name);
        }
        addons = Array.from(new Set(addons));
        logger.info('Current Addons: ');
        console.log(addons);
        writeAddons(addons);
    });
}
