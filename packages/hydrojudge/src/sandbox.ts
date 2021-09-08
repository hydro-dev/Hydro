import Axios from 'axios';
import fs from 'fs-extra';
import cac from 'cac';
import * as STATUS from './status';
import { FormatError, SystemError } from './error';
import { cmd, parseMemoryMB } from './utils';
import { getConfig } from './config';
import { Logger } from './log';

const argv = cac().parse();
const logger = new Logger('sandbox');
let callId = 0;
let supportOptional = false;

const statusMap = {
    'Time Limit Exceeded': STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    'Memory Limit Exceeded': STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    'Output Limit Exceeded': STATUS.STATUS_RUNTIME_ERROR,
    Accepted: STATUS.STATUS_ACCEPTED,
    'Nonzero Exit Status': STATUS.STATUS_RUNTIME_ERROR,
    'Internal Error': STATUS.STATUS_SYSTEM_ERROR,
    'File Error': STATUS.STATUS_SYSTEM_ERROR,
    Signalled: STATUS.STATUS_RUNTIME_ERROR,
};

function proc({
    execute = '',
    time = 16000,
    memory = parseMemoryMB(getConfig('memoryMax')),
    process_limit = 32,
    stdin = '', copyIn = {}, copyOut = [], copyOutCached = [],
} = {}) {
    if (!supportOptional) {
        copyOut = (copyOut as string[]).map((i) => (i.endsWith('?') ? i.substr(0, i.length - 1) : i));
    }
    const size = parseMemoryMB(getConfig('stdio_size'));
    const rate = getConfig('rate');
    return {
        args: cmd(execute.replace(/\$\{dir\}/g, '/w')),
        env: getConfig('env').split('\n'),
        files: [
            stdin ? { src: stdin } : { content: '' },
            { name: 'stdout', max: Math.floor(1024 * 1024 * size) },
            { name: 'stderr', max: Math.floor(1024 * 1024 * size) },
        ],
        cpuLimit: Math.floor(time * 1000 * 1000 * rate),
        realCpuLimit: Math.floor(time * 3000 * 1000 * rate),
        memoryLimit: Math.floor(memory * 1024 * 1024),
        strictMemoryLimit: getConfig('strict_memory'),
        // stackLimit: memory * 1024 * 1024,
        procLimit: process_limit,
        copyIn,
        copyOut,
        copyOutCached,
    };
}

async function adaptResult(result, params) {
    const rate = getConfig('rate');
    // FIXME: Signalled?
    const ret: any = {
        status: statusMap[result.status] || STATUS.STATUS_ACCEPTED,
        time_usage_ms: result.time / 1000000 / rate,
        memory_usage_kb: result.memory / 1024,
        files: result.files,
        code: result.exitStatus,
    };
    if (ret.time_usage_ms >= (params.time || 16000)) {
        ret.status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
    }
    ret.files = result.files || {};
    ret.fileIds = result.fileIds || {};
    if (params.stdout) await fs.writeFile(params.stdout, ret.files.stdout || '');
    else ret.stdout = ret.files.stdout || '';
    if (params.stderr) await fs.writeFile(params.stderr, ret.files.stderr || result.error || '');
    else ret.stderr = ret.files.stderr || result.error || '';
    if (result.error) ret.error = result.error;
    return ret;
}

export async function runMultiple(execute) {
    let res;
    const size = parseMemoryMB(getConfig('stdio_size'));
    try {
        const body = {
            cmd: [
                proc(execute[0]),
                proc(execute[1]),
            ],
            pipeMapping: [{
                in: { index: 0, fd: 1 },
                out: { index: 1, fd: 0 },
                proxy: true,
                name: 'stdout',
                max: 1024 * 1024 * size,
            }, {
                in: { index: 1, fd: 1 },
                out: { index: 0, fd: 0 },
                proxy: true,
                name: 'stdout',
                max: 1024 * 1024 * size,
            }],
        };
        body.cmd[0].files[0] = null;
        body.cmd[0].files[1] = null;
        body.cmd[1].files[0] = null;
        body.cmd[1].files[1] = null;
        const id = callId++;
        if (argv.options.showSandbox) logger.debug('%d %s', id, JSON.stringify(body));
        res = await Axios.create({ baseURL: getConfig('sandbox_host') }).post('/run', body);
        if (argv.options.showSandbox) logger.debug('%d %s', id, JSON.stringify(res.data));
    } catch (e) {
        if (e instanceof FormatError) throw e;
        throw new SystemError('Sandbox Error');
    }
    return await Promise.all(res.data.map((i) => adaptResult(i, {})));
}

export async function del(fileId: string) {
    const res = await Axios.create({ baseURL: getConfig('sandbox_host') }).delete(`/file/${fileId}`);
    return res.data;
}

export async function run(execute, params?) {
    let result;
    // eslint-disable-next-line no-return-await
    if (typeof execute === 'object') return await runMultiple(execute);
    try {
        if (!supportOptional) {
            const res = await Axios.create({ baseURL: getConfig('sandbox_host') }).get('/version');
            supportOptional = res.data.copyOutOptional;
            if (!supportOptional) logger.warn('Sandbox version tooooooo low! Please upgrade to at least 1.2.0');
        }
        const body = { cmd: [proc({ execute, ...params })] };
        const id = callId++;
        if (argv.options.showSandbox) logger.debug('%d %s', id, JSON.stringify(body));
        const res = await Axios.create({ baseURL: getConfig('sandbox_host') }).post('/run', body);
        if (argv.options.showSandbox) logger.debug('%d %s', id, JSON.stringify(res.data));
        [result] = res.data;
    } catch (e) {
        if (e instanceof FormatError) throw e;
        // FIXME request body larger than maxBodyLength limit
        throw new SystemError('Sandbox Error', e.message);
    }
    return await adaptResult(result, params);
}
