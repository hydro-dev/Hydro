// This file was adapted from @koishijs, MIT licensed.
/* eslint-disable consistent-return */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable @typescript-eslint/no-shadow */
import { relative, resolve, sep } from 'path';
import { FSWatcher, watch } from 'chokidar';
import { debounce } from 'lodash';
import { Context, MainScope, Service } from '../context';
import { Logger } from '../logger';
import { unwrapExports } from '../utils';

function loadDependencies(filename: string, ignored: Set<string>) {
    const dependencies = new Set<string>();
    function traverse({ filename, children }: NodeJS.Module) {
        if (ignored.has(filename) || dependencies.has(filename) || filename.includes('/node_modules/')) return;
        dependencies.add(filename);
        for (const c of children) traverse(c);
    }
    traverse(require.cache[filename]);
    return dependencies;
}

const logger = new Logger('watch');

function coerce(val: any) {
    // resolve error when stack is undefined, e.g. axios error with status code 401
    const { message, stack } = val instanceof Error && val.stack ? val : new Error(val as any);
    const lines = stack.split('\n');
    const index = lines.findIndex((line) => line.endsWith(message));
    return lines.slice(index).join('\n');
}

export default class Watcher extends Service {
    private root: string;
    private watcher: FSWatcher;
    private externals: Set<string>;
    private accepted: Set<string>;
    private declined: Set<string>;
    private stashed = new Set<string>();

    constructor(public ctx: Context) {
        super(ctx, 'watcher', true);
        this.externals = new Set(Object.keys(require.cache));
    }

    start() {
        this.root = resolve(process.cwd());
        const roots = [this.root];
        if (process.env.WATCH_ROOT) roots.push(process.env.WATCH_ROOT);
        this.watcher = watch(roots, {
            ...this.config,
            ignored: (file) => [
                'node_modules', '.git', 'logs', '.cache', '.yarn', 'tsconfig.tsbuildinfo',
            ].some((rule) => file.startsWith(`${rule}/`) || file.endsWith(`/${rule}`) || file.includes(`/${rule}/`)),
        });
        logger.info(`Start watching changes in ${this.root}`);

        // files independent from any plugins will trigger a full reload
        const triggerLocalReload = debounce(() => this.triggerLocalReload(), 1000);

        this.watcher.on('change', (path) => {
            if (path.includes(`${sep}.`)) return;
            logger.debug('change detected:', relative(this.root, path));
            this.ctx.emit('app/watch/change', path);

            if (this.externals.has(path)) {
                logger.warn('Require full reload');
            } else if (require.cache[path]) {
                this.stashed.add(path);
                this.ctx.emit('app/before-reload', this.stashed);
                triggerLocalReload();
                this.ctx.emit('app/reload', this.stashed);
            }
        });
        this.watcher.on('unlink', (path) => {
            logger.debug('change detected:', `-${relative(this.root, path)}`);
            this.ctx.emit('app/watch/unlink', path);
        });
    }

    stop() {
        return this.watcher.close();
    }

    private analyzeChanges() {
        /** files pending classification */
        const pending: string[] = [];

        this.accepted = new Set(this.stashed);
        this.declined = new Set(this.externals);

        for (const filename of this.stashed) {
            const { children } = require.cache[filename];
            for (const { filename } of children) {
                if (this.accepted.has(filename) || this.declined.has(filename) || filename.includes('/node_modules/')) continue;
                pending.push(filename);
            }
        }

        while (pending.length) {
            let index = 0;
            let hasUpdate = false;
            while (index < pending.length) {
                const filename = pending[index];
                const { children } = require.cache[filename];
                let isDeclined = true;
                let isAccepted = false;
                for (const { filename } of children) {
                    if (this.declined.has(filename) || filename.includes('/node_modules/')) continue;
                    if (this.accepted.has(filename)) {
                        isAccepted = true;
                        break;
                    } else {
                        isDeclined = false;
                        if (!pending.includes(filename)) {
                            hasUpdate = true;
                            pending.push(filename);
                        }
                    }
                }
                if (isAccepted || isDeclined) {
                    hasUpdate = true;
                    pending.splice(index, 1);
                    if (isAccepted) {
                        this.accepted.add(filename);
                    } else {
                        this.declined.add(filename);
                    }
                } else {
                    index++;
                }
            }
            // infinite loop
            if (!hasUpdate) break;
        }

        for (const filename of pending) {
            this.declined.add(filename);
        }
    }

    private triggerLocalReload() {
        const start = Date.now();
        this.analyzeChanges();

        /** plugins pending classification */
        const pending = new Map<string, MainScope>();

        /** plugins that should be reloaded */
        const reloads = new Map<MainScope, string>();

        // we assume that plugin entry files are "atomic"
        // that is, reloading them will not cause any other reloads
        for (const filename in require.cache) {
            const module = require.cache[filename];
            const plugin = unwrapExports(module.exports);
            if (!(typeof plugin === 'object' && plugin && 'apply' in plugin)) continue;
            const runtime = this.ctx.registry.get(plugin);
            if (!runtime || this.declined.has(filename)) continue;
            pending.set(filename, runtime);
            if (!(plugin && 'sideEffect' in plugin && plugin['sideEffect'])) this.declined.add(filename);
        }

        for (const [filename, runtime] of pending) {
            // check if it is a dependent of the changed file
            this.declined.delete(filename);
            const dependencies = [...loadDependencies(filename, this.declined)];
            if (!runtime.plugin['sideEffect']) this.declined.add(filename);

            // we only detect reloads at plugin level
            // a plugin will be reloaded if any of its dependencies are accepted
            if (!dependencies.some((dep) => this.accepted.has(dep))) continue;
            for (const dep of dependencies) this.accepted.add(dep);

            // prepare for reload
            let isMarked = false;
            const visited = new Set<MainScope>();
            const queued = [runtime];
            while (queued.length) {
                const runtime = queued.shift();
                if (visited.has(runtime)) continue;
                visited.add(runtime);
                if (reloads.has(runtime)) {
                    isMarked = true;
                    break;
                }
                for (const state of runtime.children) {
                    queued.push(state.runtime);
                }
            }
            if (!isMarked) reloads.set(runtime, filename);
        }

        const backup: Record<string, NodeJS.Module> = {};
        for (const filename of this.accepted) {
            backup[filename] = require.cache[filename];
            delete require.cache[filename];
        }

        function rollback() {
            for (const filename in backup) {
                require.cache[filename] = backup[filename];
            }
        }

        logger.debug('Will reload the following file(s): %o', this.accepted.keys());
        const attempts = {};
        try {
            for (const [, filename] of reloads) {
                attempts[filename] = unwrapExports(require(filename));
            }
        } catch (err) {
            logger.warn(err);
            return rollback();
        }

        try {
            for (const [runtime, filename] of reloads) {
                const path = relative(this.root, filename);
                const states = runtime.children.slice();

                try {
                    this.ctx.registry.delete(runtime.plugin);
                } catch (err) {
                    logger.warn(`failed to dispose plugin at %c\n${coerce(err)}`, path);
                }

                try {
                    const plugin = attempts[filename];
                    for (const state of states) {
                        state.parent.plugin(plugin, state.config);
                    }
                } catch (err) {
                    logger.warn(`failed to reload plugin at %c\n${coerce(err)}`, path);
                    throw err;
                }
            }
        } catch {
            // rollback require.cache and plugin states
            rollback();
            for (const [runtime, filename] of reloads) {
                try {
                    this.ctx.registry.delete(attempts[filename]);
                    runtime.parent.plugin(runtime.plugin, runtime.config);
                } catch (err) {
                    logger.warn(err);
                }
            }
            logger.warn('Rolling back changes');
            return;
        }

        // reset stashed files
        this.stashed = new Set();
        logger.success('Reload done in %d ms', Date.now() - start);
    }
}
