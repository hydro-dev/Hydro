import cac from 'cac';
import fs from 'fs-extra';
import { ParseEntry } from 'shell-quote';
import { STATUS } from '@hydrooj/utils/lib/status';
import { getConfig } from './config';
import { FormatError, SystemError } from './error';
import { Logger } from './log';
import { SandboxClient } from './sandbox/client';
import {
    Cmd, CopyInFile, SandboxResult, SandboxStatus,
} from './sandbox/interface';
import { cmd, parseMemoryMB } from './utils';

const argv = cac().parse();
const logger = new Logger('sandbox');
let callId = 0;
let supportOptional = false;

const statusMap: Map<SandboxStatus, number> = new Map([
    [SandboxStatus.TimeLimitExceeded, STATUS.STATUS_TIME_LIMIT_EXCEEDED],
    [SandboxStatus.MemoryLimitExceeded, STATUS.STATUS_MEMORY_LIMIT_EXCEEDED],
    [SandboxStatus.OutputLimitExceeded, STATUS.STATUS_RUNTIME_ERROR],
    [SandboxStatus.Accepted, STATUS.STATUS_ACCEPTED],
    [SandboxStatus.NonzeroExitStatus, STATUS.STATUS_RUNTIME_ERROR],
    [SandboxStatus.InternalError, STATUS.STATUS_SYSTEM_ERROR],
    [SandboxStatus.FileError, STATUS.STATUS_SYSTEM_ERROR],
    [SandboxStatus.Signalled, STATUS.STATUS_RUNTIME_ERROR],
]);

interface Parameter {
    time?: number;
    stdin?: string;
    stdout?: string;
    stderr?: string;
    execute?: string;
    memory?: number;
    processLimit?: number;
    copyIn?: Record<string, CopyInFile>;
    copyOut?: string[];
    copyOutCached?: string[];
}

function checkStringArray(args: ParseEntry[]): args is string[] {
    return args.every((arg: ParseEntry) => typeof arg === 'string');
}

function parseArgs(execute: string): string[] {
    const args = cmd(execute.replace(/\$\{dir\}/g, '/w'));
    if (!checkStringArray(args)) {
        throw new SystemError(`${execute} contains invalid operator`);
    }
    return args;
}

function proc({
    execute = '',
    time = 16000,
    memory = parseMemoryMB(getConfig('memoryMax')),
    processLimit = getConfig('processLimit'),
    stdin = '', copyIn = {}, copyOut = [], copyOutCached = [],
}: Parameter = {}): Cmd {
    if (!supportOptional) {
        copyOut = (copyOut as string[]).map((i) => (i.endsWith('?') ? i.substr(0, i.length - 1) : i));
    }
    const size = parseMemoryMB(getConfig('stdio_size'));
    const rate = getConfig('rate');
    return {
        args: parseArgs(execute),
        env: getConfig('env').split('\n'),
        files: [
            stdin ? { src: stdin } : { content: '' },
            { name: 'stdout', max: Math.floor(1024 * 1024 * size) },
            { name: 'stderr', max: Math.floor(1024 * 1024 * size) },
        ],
        cpuLimit: Math.floor(time * 1000 * 1000 * rate),
        clockLimit: Math.floor(time * 3000 * 1000 * rate),
        memoryLimit: Math.floor(memory * 1024 * 1024),
        strictMemoryLimit: getConfig('strict_memory'),
        // stackLimit: memory * 1024 * 1024,
        procLimit: processLimit,
        copyIn,
        copyOut,
        copyOutCached,
    };
}

async function adaptResult(result: SandboxResult, params: Parameter) {
    const rate = getConfig('rate');
    // FIXME: Signalled?
    const ret: any = {
        status: statusMap.get(result.status) || STATUS.STATUS_ACCEPTED,
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

export async function runMultiple(execute: Parameter[]) {
    let res: SandboxResult[];
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
        res = await new SandboxClient(getConfig('sandbox_host')).run(body);
        if (argv.options.showSandbox) logger.debug('%d %s', id, JSON.stringify(res));
    } catch (e) {
        if (e instanceof FormatError) throw e;
        throw new SystemError('Sandbox Error', [e]);
    }
    return await Promise.all(res.map((r) => adaptResult(r, {})));
}

export async function del(fileId: string) {
    await new SandboxClient(getConfig('sandbox_host')).deleteFile(fileId);
}

export async function run(execute: string | Parameter[], params?: Parameter) {
    let result: SandboxResult;
    if (typeof execute === 'object') return await runMultiple(execute);
    try {
        const client = new SandboxClient(getConfig('sandbox_host'));
        if (!supportOptional) {
            const res = await client.version();
            supportOptional = res.copyOutOptional;
            if (!supportOptional) logger.warn('Sandbox version tooooooo low! Please upgrade to at least 1.2.0');
        }
        const body = { cmd: [proc({ execute, ...params })] };
        const id = callId++;
        if (argv.options.showSandbox) logger.debug('%d %s', id, JSON.stringify(body));
        const res = await client.run(body);
        if (argv.options.showSandbox) logger.debug('%d %s', id, JSON.stringify(res));
        [result] = res;
    } catch (e) {
        if (e instanceof FormatError) throw e;
        // FIXME request body larger than maxBodyLength limit
        throw new SystemError('Sandbox Error', e.message);
    }
    return await adaptResult(result, params);
}
