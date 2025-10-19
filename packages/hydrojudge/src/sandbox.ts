import cac from 'cac';
import PQueue from 'p-queue';
import { gte } from 'semver';
import { ParseEntry } from 'shell-quote';
import { STATUS } from '@hydrooj/common';
import * as sysinfo from '@hydrooj/utils/lib/sysinfo';
import { getConfig } from './config';
import { FormatError, SystemError } from './error';
import { Logger } from './log';
import client from './sandbox/client';
import {
    Cmd, CopyIn, CopyInFile, PipeMap, SandboxResult, SandboxStatus,
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

export interface Parameter {
    /** in ms */
    time?: number;
    stdin?: CopyInFile;
    execute?: string;
    /** in MB */
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
    const copyIn = { ...params.copyIn };
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

function adaptResult(result: SandboxResult, params: Parameter): SandboxAdaptedResult {
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

export async function runPiped(
    execute: Parameter[], pipeMapping: Pick<PipeMap, 'in' | 'out' | 'name'>[], params: Parameter = {}, trace: string = '',
): Promise<SandboxAdaptedResult[]> {
    let res: SandboxResult[];
    const size = parseMemoryMB(getConfig('stdio_size'));
    try {
        if (!supportOptional) {
            const { copyOutOptional } = await client.version();
            supportOptional = copyOutOptional;
            if (!copyOutOptional) logger.warn('Sandbox version tooooooo low! Please upgrade to at least 1.2.0');
        }
        const body = {
            cmd: execute.map((exe) => proc({ ...exe, ...params })),
            pipeMapping: pipeMapping.map((pipe) => ({
                proxy: true,
                max: 1024 * 1024 * size,
                ...pipe,
            })),
        };
        for (let i = 0; i < body.cmd.length; i++) {
            if (pipeMapping.find((pipe) => pipe.out.index === i && pipe.out.fd === 0)) body.cmd[i].files[0] = null;
            if (pipeMapping.find((pipe) => pipe.in.index === i && pipe.in.fd === 1)) body.cmd[i].files[1] = null;
        }
        const id = callId++;
        if (argv.options.showSandbox) logger.debug('%d %s', id, JSON.stringify(body));
        res = await client.run(body, trace);
        if (argv.options.showSandbox) logger.debug('%d %s', id, JSON.stringify(res));
    } catch (e) {
        if (e instanceof FormatError || e instanceof SystemError) throw e;
        console.error(e);
        throw new SystemError('Sandbox Error', [e]);
    }
    return res.map((r) => adaptResult(r, params)) as SandboxAdaptedResult[];
}

export async function del(fileId: string) {
    await client.deleteFile(fileId);
}

export async function get(fileId: string, dest?: string) {
    return await client.getFile(fileId, dest);
}

const queue = new PQueue({ concurrency: getConfig('concurrency') || getConfig('parallelism') });

export function runQueued(
    execute: Parameter[], pipeMapping: Pick<PipeMap, 'in' | 'out' | 'name'>[],
    params: Parameter, trace?: string, priority?: number,
): Promise<SandboxAdaptedResult[] & AsyncDisposable>;
export function runQueued(
    execute: string, params: Parameter, trace?: string, priority?: number,
): Promise<SandboxAdaptedResult & AsyncDisposable>;
export function runQueued(
    arg0: string | Parameter[], arg1: Pick<PipeMap, 'in' | 'out' | 'name'>[] | Parameter,
    arg2?: string | Parameter, arg3?: string | number, arg4?: number,
) {
    const single = !Array.isArray(arg0);
    const [execute, pipeMapping, params, trace, priority] = single
        ? [[{ execute: arg0 }], [], arg1 || {}, arg2 || '', arg3 || 0] as any
        : [arg0, arg1, arg2 || {}, arg3 || '', arg4 || 0];
    return queue.add(async () => {
        const res = await runPiped(execute, pipeMapping, params, trace);
        const ret = single ? res[0] : res;
        (ret as any)[Symbol.asyncDispose] = () => Promise.allSettled(res.flatMap((t) => Object.values(t.fileIds || {}).map(del)));
        return ret;
    }, { priority });
}

export async function versionCheck(reportWarn: (str: string) => void, reportError = reportWarn) {
    let sandboxVersion: string;
    let sandboxCgroup: number;
    let sandboxCgroupControllers: string[] | null;
    try {
        const version = await client.version();
        sandboxVersion = version.buildVersion.split('v')[1];
        const config = await client.config();
        sandboxCgroup = config.runnerConfig?.cgroupType || 0;
        sandboxCgroupControllers = config.runnerConfig?.cgroupControllers || null;
    } catch (e) {
        if (e?.code === 'ECONNREFUSED') reportError('Failed to connect to sandbox, please check sandbox_host config and if your sandbox is running.');
        else reportError('Your sandbox version is tooooooo low! Please upgrade!');
        return false;
    }
    const { osinfo } = await sysinfo.get();
    if (sandboxCgroup === 2) {
        const kernelVersion = osinfo.kernel.match(/^\d+\.\d+\.\d+/)[0];
        if (!gte(kernelVersion, '5.19.0') || !gte(sandboxVersion, '1.6.10')) {
            reportWarn('You are using cgroup v2 without kernel 5.19+. This could result in inaccurate memory usage measurements.');
        }
    }
    if (sandboxCgroupControllers) {
        if (!sandboxCgroupControllers.includes('memory') && gte(sandboxVersion, '1.8.6')) {
            reportWarn('The memory cgroup controller is not enabled. This could result in inaccurate memory usage measurements.');
        }
    }
    return true;
}

export * from './sandbox/interface';
