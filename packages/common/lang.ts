import yaml from 'js-yaml';

export interface LangConfig {
    disabled?: boolean;
    compile?: string;
    execute: string;
    code_file: string;
    highlight: string;
    monaco: string;
    time_limit_rate: number;
    memory_limit_rate: number;
    address_space_limit?: boolean;
    process_limit?: number;
    display: string;
    target?: string;
    key: string;
    hidden: boolean;
    isBinary?: boolean;
    analysis?: string;
    /** @deprecated */
    remote?: string;
    validAs?: Record<string, string>;
    /** @deprecated */
    pretest?: string | false;
    comment?: string | [string, string];
    compile_time_limit?: number;
    compile_memory_limit?: number;
    version?: string;
}

export function parseLang(config: string): Record<string, LangConfig> {
    const file = yaml.load(config) as Record<string, LangConfig>;
    if (typeof file === 'undefined' || typeof file === 'string' || typeof file === 'number') throw new Error();
    for (const key of Object.keys(file)) if (key.startsWith('_')) delete file[key];
    for (const key in file) {
        const entry = file[key];
        if (key.includes('.')) {
            const base = key.split('.')[0];
            const baseCfg = file[base];
            for (const bkey in baseCfg || {}) {
                if (!(bkey in entry)) entry[bkey] = baseCfg[bkey];
            }
        }
    }
    for (const key in file) {
        const entry = file[key];
        entry.highlight ||= key;
        entry.monaco ||= entry.highlight;
        entry.time_limit_rate ||= 1;
        entry.memory_limit_rate ||= 1;
        entry.code_file ||= `foo.${key}`;
        entry.execute ||= '/w/foo';
        entry.key = key;
        entry.hidden ||= false;
        entry.disabled ||= false;
        entry.isBinary ||= false;
        entry.validAs ||= {};
    }
    return file;
}
