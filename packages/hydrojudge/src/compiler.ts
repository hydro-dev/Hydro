import { LangConfig } from '@hydrooj/utils/lib/lang';
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
            memory: 256 * 1024 * 1024,
        }, 5);
        result[lang] = `${res.stdout}\n${res.stderr}`.trim();
    }
    return result;
}
