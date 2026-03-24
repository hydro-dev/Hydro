import os from 'os';
import path from 'path';
import cac from 'cac';
import Schema from 'schemastery';
import { fs, randomstring, yaml } from '@hydrooj/utils';

const argv = cac().parse();

const defaultEnv = `\
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOME=/w
# modify to your python version installed
PYTHONPATH=/lib/python3.13/site-packages
`;

export const JudgeSettings = Schema.object({
    cache_dir: Schema.string().default(path.resolve(os.homedir(), '.cache', 'hydro', 'judge')).description('Testdata cache directory'),
    tmp_dir: Schema.string().default(path.resolve(os.tmpdir(), 'hydro', 'judge')),
    stdio_size: Schema.string().pattern(/^\d+[kmg]b?$/g).default('32m'),
    memoryMax: Schema.string().pattern(/^\d+[kmg]b?$/g).default('512m'),
    strict_memory: Schema.boolean().default(false).description('Use address space memory limit'),
    sandbox_host: Schema.string().role('url').default('http://localhost:5050'),
    testcases_max: Schema.number().default(100).min(1).step(1),
    total_time_limit: Schema.number().default(60).min(1),
    processLimit: Schema.number().default(32).min(1).step(1),
    parallelism: Schema.number().default(2).min(1).step(1),
    concurrency: Schema.number(),
    singleTaskParallelism: Schema.number().default(2).min(1).step(1),
    rerun: Schema.number().description('Re-Run testcase if time-limit-exceeded (max per submission)').default(0).min(0).step(1),
    rate: Schema.number().default(1),
    env: Schema.string().default(defaultEnv).role('textarea'),
    host: Schema.any(),
    secret: Schema.string().description('Judge Token Secret').default(randomstring(32)),
    disable: Schema.boolean().description('Disable builtin judge').default(false),
    tracing: Schema.object({
        endpoint: Schema.string().role('url').description('Tempo endpoint').default('http://localhost:4318'),
        samplePercentage: Schema.number().description('Sample percentage').default(0).min(0).max(1),
    }),
    detail: Schema.union([
        Schema.const('full'),
        Schema.const('case'),
        Schema.const('none'),
        Schema.transform(Schema.union([
            Schema.boolean().deprecated(),
            Schema.const('full'),
            Schema.const('none'),
            Schema.const('case'),
        ]), (v) => (typeof v === 'boolean' ? (v ? 'full' : 'case') : v)),
    ]).description('Show diff detail').default('full'),
    performance: Schema.boolean().description('Performance mode').default(false),
});

const oldPath = path.resolve(os.homedir(), '.config', 'hydro', 'judge.yaml');
const newPath = path.resolve(os.homedir(), '.hydro', 'judge.yaml');

let config = global.Hydro
    ? JudgeSettings({})
    : (() => {
        const base: any = {};
        if (process.env.TEMP_DIR || argv.options.tmp) {
            base.tmp_dir = path.resolve(process.env.TEMP_DIR || argv.options.tmp);
        }
        if (process.env.CACHE_DIR || argv.options.cache) {
            base.cache_dir = path.resolve(process.env.CACHE_DIR || argv.options.cache);
        }
        if (process.env.EXECUTION_HOST || argv.options.sandbox) {
            base.sandbox_host = path.resolve(process.env.EXECUTION_HOST || argv.options.sandbox);
        }
        const configFilePath = (process.env.CONFIG_FILE || argv.options.config)
            ? path.resolve(process.env.CONFIG_FILE || argv.options.config)
            : fs.existsSync(oldPath) ? oldPath : newPath;
        const configFile = fs.readFileSync(configFilePath, 'utf-8');
        Object.assign(base, yaml.load(configFile) as any);
        const cfg = JudgeSettings(base);
        return JudgeSettings(cfg);
    })();

export function overrideConfig(update: ReturnType<typeof JudgeSettings>) {
    config = JudgeSettings(update);
}

export const getConfig: <K extends keyof typeof config>(key: K) => typeof config[K] = (key) => config[key];
