// This file was adapted from @koishijs, MIT licensed.
/* eslint-disable consistent-return */
/* eslint-disable ts/no-shadow */
import { readFileSync } from 'fs';
import { relative } from 'path';
import { codeFrameColumns } from '@babel/code-frame';
import { BuildFailure } from 'esbuild';
import { Context, Plugin, Service } from '../context';
import { Logger } from '../logger';
import { unwrapExports } from '../utils';

declare module '../context' {
    interface Events {
        'hmr/reload': (reloads: Map<Plugin, { filename: string, runtime: Plugin.Runtime<Context> }>) => void;
    }
    interface Context {
        hmr: HMR;
    }
}

function isBuildFailure(e: any): e is BuildFailure {
    return Array.isArray(e?.errors) && e.errors.every((error: any) => error.text);
}

export function handleError(ctx: Context, e: any) {
    if (!isBuildFailure(e)) {
        ctx.logger.warn(e);
        return;
    }

    for (const error of e.errors) {
        if (!error.location) {
            ctx.logger.warn(error.text);
            continue;
        }
        try {
            const { file, line, column } = error.location;
            const source = readFileSync(file, 'utf8');
            const formatted = codeFrameColumns(source, {
                start: { line, column },
            }, {
                highlightCode: true,
                message: error.text,
            });
            ctx.logger.warn(`File: ${file}:${line}:${column}\n${formatted}`);
        } catch (e) {
            ctx.logger.warn(e);
        }
    }
}

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

const logger = new Logger('hmr');

export default class HMR extends Service {
    private root = process.cwd();
    private externals: Set<string>;
    private accepted: Set<string>;
    private declined: Set<string>;
    private stashed = new Set<string>();

    constructor(public ctx: Context, config: { watch: boolean }) {
        super(ctx, 'hmr');
        this.externals = new Set(Object.keys(require.cache));
        const debouncedReload = ctx.debounce(() => this.triggerLocalReload(), 1000);
        this.ctx.on('app/watch/change', (path) => {
            if (this.externals.has(path)) {
                logger.warn('Require full reload');
            } else if (require.cache[path]) {
                this.stashed.add(path);
                this.ctx.emit('app/before-reload', this.stashed);
                debouncedReload();
                this.ctx.emit('app/reload', this.stashed);
            }
        });
        if (config.watch) ctx.plugin(require('./watch'));
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
                const children = require.cache[filename]?.children || [];
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

    private async triggerLocalReload() {
        this.analyzeChanges();

        /** plugins pending classification */
        const pending = new Map<string, Plugin>();

        /** plugins that should be reloaded */
        const reloads = new Map<Plugin, { filename: string, runtime: Plugin.Runtime<Context> }>();

        // we assume that plugin entry files are "atomic"
        // that is, reloading them will not cause any other reloads
        for (const filename in require.cache) {
            const module = require.cache[filename];
            const plugin = unwrapExports(module.exports);
            if (!plugin) continue;
            const runtime = this.ctx.registry.get(plugin);
            if (!runtime || this.declined.has(filename)) continue;
            pending.set(filename, plugin);
            if (!plugin?.sideEffect) this.declined.add(filename);
        }

        for (const [filename, plugin] of pending) {
            // check if it is a dependent of the changed file
            this.declined.delete(filename);
            const dependencies = [...loadDependencies(filename, this.declined)];
            const runtime = this.ctx.registry.get(plugin);
            if (!plugin['sideEffect']) this.declined.add(filename);

            // we only detect reloads at plugin level
            // a plugin will be reloaded if any of its dependencies are accepted
            if (!dependencies.some((dep) => this.accepted.has(dep))) continue;
            for (const dep of dependencies) this.accepted.add(dep);

            // prepare for reload
            reloads.set(plugin, {
                filename,
                runtime,
            });
        }

        const backup: Record<string, NodeJS.Module> = Object.create(null);
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
        const attempts: Record<string, any> = {};
        try {
            for (const [, { filename }] of reloads) {
                attempts[filename] = unwrapExports(require(filename));
            }
        } catch (e) {
            handleError(this.ctx, e);
            return rollback();
        }

        const reload = async (plugin: any, runtime?: Plugin.Runtime) => {
            if (!runtime) return;
            for (const oldFiber of runtime.fibers) {
                // eslint-disable-next-line no-await-in-loop
                await oldFiber.parent.plugin(plugin, oldFiber.config);
            }
        };

        try {
            for (const [plugin, { filename, runtime }] of reloads) {
                const path = relative(this.root, filename);

                try {
                    this.ctx.registry.delete(plugin);
                } catch (err) {
                    logger.warn('failed to dispose plugin at %c', path);
                    logger.warn(err);
                }

                try {
                    // eslint-disable-next-line no-await-in-loop
                    await reload(attempts[filename], runtime);
                    logger.info('reload plugin at %c', path);
                } catch (err) {
                    logger.warn('failed to reload plugin at %c', path);
                    logger.warn(err);
                    throw err;
                }
            }
        } catch {
            // rollback require.cache and plugin states
            rollback();
            for (const [plugin, { filename, runtime }] of reloads) {
                try {
                    this.ctx.registry.delete(attempts[filename]);
                    // eslint-disable-next-line no-await-in-loop
                    await reload(plugin, runtime);
                } catch (err) {
                    logger.warn(err);
                }
            }
            return;
        }

        // emit reload event on success
        this.ctx.emit('hmr/reload', reloads);

        // reset stashed files
        this.stashed = new Set();
    }
}
