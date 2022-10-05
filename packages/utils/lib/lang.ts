import yaml from 'js-yaml';

export interface LangConfig {
    compile?: string;
    execute: string;
    code_file: string;
    highlight: string;
    monaco: string;
    time_limit_rate: number;
    domain: string[];
    display: string;
    target?: string;
    key: string;
    hidden: boolean;
    analysis?: string;
    remote?: string;
    pretest?: string;
}

export function parseLang(config: string): Record<string, LangConfig> {
    const file = yaml.load(config) as Record<string, LangConfig>;
    if (typeof file === 'undefined' || typeof file === 'string' || typeof file === 'number') throw new Error();
    Object.keys(file).filter((i) => i.startsWith('_')).forEach((k) => delete file[k]);
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
        entry.highlight = entry.highlight || key;
        entry.monaco = entry.monaco || entry.highlight;
        entry.time_limit_rate = entry.time_limit_rate || 1;
        entry.code_file = entry.code_file || `foo.${key}`;
        entry.execute = entry.execute || '/w/foo';
        entry.key = key;
        entry.hidden = entry.hidden || false;
    }
    return file;
}
