/* eslint-disable no-await-in-loop */
import { tmpdir } from 'os';
import path from 'path';
import fs from 'fs-extra';
import { STATUS } from '@hydrooj/common';
import { SystemError } from '../error';
import { CopyInFile, runQueued } from '../sandbox';
import client from '../sandbox/client';
import signals from '../signals';
import { JudgeTask } from '../task';
import { parseMemoryMB, parseTimeMS } from '../utils';

export const judge = async (ctx: JudgeTask) => {
    ctx.next({ status: STATUS.STATUS_COMPILING });
    if (!('content' in ctx.code)) throw new SystemError('Unsupported input');
    const [generator, std] = ctx.code.content.toString().split('\n').map((i) => i.trim());
    if (generator.includes('/') || generator === '..') throw new SystemError('Invalid input');
    if (std.includes('/') || std === '..') throw new SystemError('Invalid input');
    const [executeGenerator, executeStd] = await Promise.all([
        ctx.compileLocalFile('generator', generator),
        ctx.compileLocalFile('std', std),
    ]);
    ctx.next({ status: STATUS.STATUS_JUDGING, progress: 0 });
    let totalTime = 0;
    let totalMemory = 0;
    let totalStatus = 0;

    async function runGenerator(i: number) {
        await using res = await runQueued(
            `${executeGenerator.execute} ${i}`,
            {
                stdin: { content: (ctx.input || [])[i - 1] || '' },
                copyIn: executeGenerator.copyIn,
                copyOut: ['stderr'],
                copyOutCached: ['stdout'],
                time: parseTimeMS('2s'),
                memory: parseMemoryMB('256m'),
            },
            `generate[${i}]<${ctx.rid}>`,
            1,
        );
        const tmp = path.join(tmpdir(), `${ctx.request.rid}.${i}.in`);
        ctx.pushClean(() => {
            if (fs.existsSync(tmp)) fs.removeSync(tmp);
        });
        const {
            code, signalled, time, memory, fileIds, stderr,
        } = res;
        let { status } = res;
        const message = [stderr.substring(0, 1024)];
        if (time > parseTimeMS(ctx.config.time || '2s')) {
            status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
        } else if (memory > parseMemoryMB('256m') * 1024) {
            status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
        } else if (code) {
            status = STATUS.STATUS_RUNTIME_ERROR;
            if (code < 32 && signalled) message.push(`ExitCode: ${code} (${signals[code]})`);
            else message.push(`ExitCode: ${code}`);
        }
        totalTime += time;
        totalMemory = Math.max(memory, totalMemory);
        totalStatus = Math.max(status, totalStatus);
        if (status === STATUS.STATUS_ACCEPTED) {
            await client.getFile(fileIds['stdout'], tmp);
            await ctx.session.postFile(ctx.request.rid.toString(), `${i}.in`, tmp);
        }
        ctx.next({
            case: {
                id: i,
                subtaskId: 1,
                status,
                score: 0,
                time,
                memory,
                message: message.join('\n').substring(0, 102400),
            },
        });
        return status === STATUS.STATUS_ACCEPTED ? tmp : null;
    }
    async function runStd(i: number, stdin: CopyInFile) {
        await using res = await runQueued(
            `${executeStd.execute} ${i}`,
            {
                stdin,
                copyIn: executeStd.copyIn,
                copyOut: ['stderr'],
                copyOutCached: ['stdout'],
                time: parseTimeMS('2s'),
                memory: parseMemoryMB('256m'),
            },
            `generate.std[${i}]<${ctx.rid}>`,
            1,
        );
        const tmp = path.join(tmpdir(), `${ctx.request.rid}.${i}.out`);
        ctx.pushClean(() => {
            if (fs.existsSync(tmp)) fs.removeSync(tmp);
        });
        const {
            code, signalled, time, memory, fileIds, stderr,
        } = res;
        let { status } = res;
        const message = [stderr.substring(0, 1024)];
        if (time > parseTimeMS(ctx.config.time || '2s')) {
            status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
        } else if (memory > parseMemoryMB('256m') * 1024) {
            status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
        } else if (code) {
            status = STATUS.STATUS_RUNTIME_ERROR;
            if (code < 32 && signalled) message.push(`ExitCode: ${code} (${signals[code]})`);
            else message.push(`ExitCode: ${code}`);
        }
        totalTime += time;
        totalMemory = Math.max(memory, totalMemory);
        totalStatus = Math.max(status, totalStatus);
        if (status === STATUS.STATUS_ACCEPTED) {
            await client.getFile(fileIds['stdout'], tmp);
            await ctx.session.postFile(ctx.request.rid.toString(), `${i}.out`, tmp);
        }
        ctx.next({
            case: {
                id: i,
                subtaskId: 2,
                status,
                score: 0,
                time,
                memory,
                message: message.join('\n').substring(0, 102400),
            },
        });
        return status === STATUS.STATUS_ACCEPTED;
    }

    for (let i = 1; i <= 10; i++) {
        const result = await runGenerator(i);
        if (result) await runStd(i, { src: result });
    }
    ctx.end({
        status: totalStatus,
        score: totalStatus === STATUS.STATUS_ACCEPTED ? 100 : 0,
        time: totalTime,
        memory: totalMemory,
    });
};
