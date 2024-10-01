import cac from 'cac';
import PQueue from 'p-queue';
import { gte } from 'semver';
import { ParseEntry } from 'shell-quote';
import { STATUS } from '@hydrooj/utils/lib/status';
import * as sysinfo from '@hydrooj/utils/lib/sysinfo';
import { getConfig } from './config';
import { FormatError, SystemError } from './error';
import { Logger } from './log';
import client from './sandbox/client';
import {
    Cmd, CopyIn, CopyInFile, SandboxResult, SandboxStatus,
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
    stdin?: CopyInFile;
    execute?: string;
    memory?: number;
    processLimit?: number;
    addressSpaceLimit?: boolean;
    copyIn?: CopyIn;
    copyOut?: string[];
    copyOutCached?: string[];
    cacheStdoutAndStderr?: boolean;
    env?: Record<string, string>;
    /** redirect stdin & stdout */
    filename?: string;
}

interface SandboxAdaptedResult {
    status: number;
    code: number;
    signalled: boolean;
    /** in miliseconds */
    time: number;
    /** in kilobytes */
    memory?: number;
    files: Record<string, string>;
    fileIds?: Record<string, string>;
    stdout?: string;
    stderr?: string;
    error?: string;
}

function checkStringArray(args: ParseEntry[]): args is string[] {
    return args.every((arg: ParseEntry) => typeof arg === 'string');
}

function parseArgs(execute: string): string[] {
    const args = cmd(execute);
    if (!checkStringArray(args)) {
        throw new SystemError(`${execute} contains invalid operator`);
    }
    return args;
}

function proc(params: Parameter): Cmd {
    const copyOut = supportOptional
        ? (params.copyOut || [])
        : (params.copyOut || []).map((i) => (i.endsWith('?') ? i.substring(0, i.length - 1) : i));
    const stdioLimit = parseMemoryMB(getConfig('stdio_size'));
    const stdioSize = params.cacheStdoutAndStderr ? stdioLimit : 4;
    const copyOutCached = [...(params.copyOutCached || [])];
    if (params.cacheStdoutAndStderr) {
        copyOutCached.push('stdout', 'stderr');
        if (params.filename) copyOutCached.push(`${params.filename}.out?`);
    } else if (params.filename) copyOut.push(`${params.filename}.out${supportOptional ? '?' : ''}`);
    const copyIn = { ...(params.copyIn || {}) };
    const stdin = params.stdin || { content: '' };
    if (params.filename) copyIn[`${params.filename}.in`] = stdin;
    const time = params.time || 16000;
    const cpuLimit = Math.floor(time * 1000 * 1000 * getConfig('rate'));
    const memory = params.memory || parseMemoryMB(getConfig('memoryMax'));
    return {
        args: parseArgs(params.execute || ''),
        env: [
            ...getConfig('env').split('\n').map((i) => i.trim()).filter((i) => !i.startsWith('#')),
            ...Object.entries(params.env || {}).map(([k, v]) => `${k}=${v.replace(/=/g, '\\=')}`),
        ],
        files: [
            params.filename ? { content: '' } : stdin,
            { name: 'stdout', max: Math.floor(1024 * 1024 * stdioSize) },
            { name: 'stderr', max: Math.floor(1024 * 1024 * stdioSize) },
        ],
        cpuLimit,
        clockLimit: 3 * cpuLimit,
        memoryLimit: Math.floor(memory * 1024 * 1024),
        strictMemoryLimit: getConfig('strict_memory'),
        addressSpaceLimit: params.addressSpaceLimit,
        stackLimit: getConfig('strict_memory') ? Math.floor(memory * 1024 * 1024) : 0,
        procLimit: params.processLimit || getConfig('processLimit'),
        copyOutMax: Math.floor(1024 * 1024 * stdioLimit * 3),
        copyIn,
        copyOut,
        copyOutCached,
    };
}

async function adaptResult(result: SandboxResult, params: Parameter): Promise<SandboxAdaptedResult> {
    const rate = getConfig('rate') as number;
    // FIXME: Signalled?
    const ret: SandboxAdaptedResult = {
        status: statusMap.get(result.status) || STATUS.STATUS_ACCEPTED,
        signalled: result.status === SandboxStatus.Signalled,
        time: result.time / 1000000 / rate,
        memory: result.memory / 1024,
        files: result.files,
        code: result.exitStatus,
    };
    if (ret.time > (params.time || 16000)) {
        ret.status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
    }
    if (ret.memory > 1024 * (params.memory || parseMemoryMB(getConfig('memoryMax')))) {
        ret.status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
    }
    const outname = params.filename ? `${params.filename}.out` : 'stdout';
    ret.files = result.files || {};
    ret.fileIds = result.fileIds || {};
    if (ret.fileIds[outname]) ret.fileIds.stdout = ret.fileIds[outname];
    if (params.filename && !ret.fileIds[outname] && !ret.files[outname]) {
        result.error = 'Output file not found';
        ret.status = STATUS.STATUS_RUNTIME_ERROR;
    }
    ret.stdout = ret.files[outname] || '';
    ret.stderr = ret.files.stderr || result.error || '';
    if (result.error) ret.error = result.error;
    return ret;
}

export async function runPiped(execute0: Parameter, execute1: Parameter): Promise<[SandboxAdaptedResult, SandboxAdaptedResult]> {
    let res: SandboxResult[];
    const size = parseMemoryMB(getConfig('stdio_size'));
    try {
        const body = {
            cmd: [
                proc(execute0),
                proc(execute1),
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
        res = await client.run(body);
        if (argv.options.showSandbox) logger.debug('%d %s', id, JSON.stringify(res));
    } catch (e) {
        if (e instanceof FormatError || e instanceof SystemError) throw e;
        console.error(e);
        throw new SystemError('Sandbox Error', [e]);
    }
    return await Promise.all(res.map((r) => adaptResult(r, {}))) as [SandboxAdaptedResult, SandboxAdaptedResult];
}

export async function del(fileId: string) {
    await client.deleteFile(fileId);
}

export async function get(fileId: string) {
    return await client.getFile(fileId);
}

export async function run(execute: string, params?: Parameter): Promise<SandboxAdaptedResult> {
    let result: SandboxResult;
    try {
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
        if (e instanceof FormatError || e instanceof SystemError) throw e;
        console.error(e);
        // FIXME request body larger than maxBodyLength limit
        throw new SystemError('Sandbox Error', e.message);
    }
    return await adaptResult(result, params);
}

const queue = new PQueue({ concurrency: getConfig('concurrency') || getConfig('parallelism') });

export function runQueued(execute: string, params?: Parameter, priority = 0) {
    return queue.add(() => run(execute, params), { priority }) as Promise<SandboxAdaptedResult>;
}

export async function versionCheck(reportWarn: (str: string) => void, reportError = reportWarn) {
    let sandboxVersion: string;
    let sandboxCgroup: number;
    try {
        const version = await client.version();
        sandboxVersion = version.buildVersion.split('v')[1];
        const config = await client.config();
        sandboxCgroup = config.runnerConfig?.cgroupType || 0;
    } catch (e) {
        if (e?.syscall === 'connect') reportError('Connecting to sandbox failed, please check sandbox_host config and if your sandbox is running.');
        else reportError('Your sandbox version is tooooooo low! Please upgrade!');
        return false;
    }
    const { osinfo } = await sysinfo.get();
    if (sandboxCgroup === 2) {
        const kernelVersion = osinfo.kernel.split('-')[0];
        if (!(gte(kernelVersion, '5.19.0') && gte(sandboxVersion, '1.6.10'))) {
            reportWarn('You are using cgroup v2 without kernel 5.19+. This could result in inaccurate memory usage measurements.');
        }
    }
    return true;
}

export * from './sandbox/interface';
