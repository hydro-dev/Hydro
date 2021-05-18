import Axios from 'axios';
import fs from 'fs-extra';
import { argv } from 'yargs';
import * as STATUS from './status';
import { FormatError, SystemError } from './error';
import { cmd, parseMemoryMB } from './utils';
import { getConfig } from './config';
import { Logger } from './log';

const logger = new Logger('sandbox');
let callId = 0;

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
    const size = parseMemoryMB(getConfig('stdio_size'));
    return {
        args: cmd(execute.replace(/\$\{dir\}/g, '/w')),
        env: getConfig('env').split('\n'),
        files: [
            stdin ? { src: stdin } : { content: '' },
            { name: 'stdout', max: 1024 * 1024 * size },
            { name: 'stderr', max: 1024 * 1024 * size },
        ],
        cpuLimit: time * 1000 * 1000,
        realCpuLimit: time * 3000 * 1000,
        memoryLimit: memory * 1024 * 1024,
        procLimit: process_limit,
        copyIn,
        copyOut,
        copyOutCached,
    };
}

async function adaptResult(result, params) {
    // FIXME: Signalled?
    const ret: any = {
        status: statusMap[result.status] || STATUS.STATUS_ACCEPTED,
        time_usage_ms: result.time / 1000000,
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
    if (params.stderr) await fs.writeFile(params.stderr, ret.files.stderr || '');
    else ret.stderr = ret.files.stderr || '';
    if (result.error) ret.error = result.error;
    return ret;
}

export async function runMultiple(execute) {
    let res;
    try {
        const body = {
            cmd: [
                proc(execute[0]),
                proc(execute[1]),
            ],
            pipeMapping: [{
                in: { index: 0, fd: 1 },
                out: { index: 1, fd: 0 },
            }, {
                in: { index: 1, fd: 1 },
                out: { index: 0, fd: 0 },
            }],
        };
        body.cmd[0].files[0] = null;
        body.cmd[0].files[1] = null;
        body.cmd[1].files[0] = null;
        body.cmd[1].files[1] = null;
        const id = callId++;
        if (argv['show-sandbox-call']) logger.debug('%d %s', id, JSON.stringify(body));
        res = await Axios.create({ baseURL: getConfig('sandbox_host') }).post('/run', body);
        if (argv['show-sandbox-call']) logger.debug('%d %s', id, JSON.stringify(res.data));
    } catch (e) {
        if (e instanceof FormatError) throw e;
        throw new SystemError('Sandbox Error');
    }
    return await Promise.all(res.data.map((i) => adaptResult(i, {})));
}

export async function del(fileId) {
    const res = await Axios.create({ baseURL: getConfig('sandbox_host') }).delete(`/file/${fileId}`);
    return res.data;
}

export async function run(execute, params?) {
    let result;
    global.reqCount++;
    // eslint-disable-next-line no-return-await
    if (typeof execute === 'object') return await runMultiple(execute);
    try {
        const body = { cmd: [proc({ execute, ...params })] };
        const id = callId++;
        if (argv['show-sandbox-call']) logger.debug('%d %s', id, JSON.stringify(body));
        const res = await Axios.create({ baseURL: getConfig('sandbox_host') }).post('/run', body);
        if (argv['show-sandbox-call']) logger.debug('%d %s', id, JSON.stringify(res.data));
        [result] = res.data;
    } catch (e) {
        if (e instanceof FormatError) throw e;
        // FIXME request body larger than maxBodyLength limit
        throw new SystemError('Sandbox Error', e.message);
    }
    return await adaptResult(result, params);
}
