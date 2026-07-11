import { relative, resolve, sep } from 'path';
import { watch } from 'chokidar';
import { Context } from '../context';
import { Logger } from '../logger';

const logger = new Logger('watcher');

export const apply = (ctx: Context) => {
    const root = resolve(process.cwd());
    const roots = [root];
    if (process.env.WATCH_ROOT) roots.push(process.env.WATCH_ROOT);
    const watcher = watch(roots, {
        ignored: (file) => file.endsWith('.log') || [
            'node_modules', '.git', 'logs', '.cache', '.yarn', 'tsconfig.tsbuildinfo',
        ].some((rule) => file.startsWith(`${rule}/`) || file.endsWith(`/${rule}`) || file.includes(`/${rule}/`)),
    });
    logger.info(`Start watching changes in ${root}`);
    // files independent from any plugins will trigger a full reload
    watcher.on('change', (path) => {
        if (path.includes(`${sep}.`)) return;
        logger.debug('change detected:', relative(root, path));
        ctx.emit('app/watch/change', path);
    });
    watcher.on('unlink', (path) => {
        logger.debug('change detected:', `-${relative(root, path)}`);
        ctx.emit('app/watch/unlink', path);
    });
    return () => {
        watcher.close();
    };
};
