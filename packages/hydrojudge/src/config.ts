import os from 'os';
import path from 'path';
import cac from 'cac';
import Schema from 'schemastery';
import { fs, yaml } from '@hydrooj/utils';

const argv = cac().parse();

const JudgeSettings = Schema.object({
    cache_dir: Schema.string().default(path.resolve(os.homedir(), '.cache', 'hydro', 'judge')),
    tmp_dir: Schema.string().default(path.resolve(os.tmpdir(), 'hydro', 'judge')),
    stdio_size: Schema.string().pattern(/^\d+[kmg]b?$/g).default('32m'),
    memoryMax: Schema.string().pattern(/^\d+[kmg]b?$/g).default('512m'),
    strict_memory: Schema.boolean().default(false),
    sandbox_host: Schema.string().role('link').default('http://localhost:5050'),
    testcases_max: Schema.number().default(100),
    total_time_limit: Schema.number().default(60),
    processLimit: Schema.number().default(32),
    parallelism: Schema.number().default(2),
    concurrency: Schema.number(),
    singleTaskParallelism: Schema.number().default(2),
    rerun: Schema.number().description('Re-Run testcase if time-limit-exceeded (max per submission)').default(0),
    rate: Schema.number().default(1),
    env: Schema.string().default('PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nHOME=/w'),
    host: Schema.any(),
    secret: Schema.string().description('Judge Token Secret').default(String.random(32)),
    disable: Schema.boolean().description('Disable builtin judge').default(false),
    detail: Schema.boolean().description('Show diff detail').default(true),
    performance: Schema.boolean().description('Performance mode').default(false),
});

const oldPath = path.resolve(os.homedir(), '.config', 'hydro', 'judge.yaml');
const newPath = path.resolve(os.homedir(), '.hydro', 'judge.yaml');

const config = global.Hydro
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

export const getConfig: <K extends keyof typeof config>(key: K) => typeof config[K] = global.Hydro
    ? (key) => global.Hydro.model.system.get(`hydrojudge.${key}`) ?? config[key]
    : (key) => config[key];
