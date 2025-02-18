import { LangConfig } from '@hydrooj/common';
import { runQueued } from './sandbox';

export async function compilerVersions(langs: Record<string, LangConfig>) {
    const result = {};
    for (const lang in langs) {
        const version = langs[lang].version;
        if (!version) continue;
        // eslint-disable-next-line no-await-in-loop
        const res = await runQueued(version, {
            copyIn: {},
            time: 10000,
            memory: 256,
        }, 'compilerVersions', 5);
        result[lang] = `${res.stdout}\n${res.stderr}`.trim();
    }
    return result;
}

export async function stackSize() {
    const res = await runQueued('/bin/bash -c "ulimit -s"', {
        copyIn: {},
        time: 10000,
        memory: 256,
    }, 'stackSize', 5);
    if (res.stderr) return -1;
    return +res.stdout;
}
