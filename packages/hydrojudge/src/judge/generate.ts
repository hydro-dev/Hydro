import { tmpdir } from 'os';
import path from 'path';
import fs from 'fs-extra';
import { STATUS } from '@hydrooj/utils/lib/status';
import { SystemError } from 'hydrooj';
import { runQueued } from '../sandbox';
import client from '../sandbox/client';
import signals from '../signals';
import { JudgeTask } from '../task';
import { parseMemoryMB, parseTimeMS } from '../utils';

export const judge = async (ctx: JudgeTask) => {
    const tmp = path.join(tmpdir(), `${ctx.request.rid}.zip`);
    ctx.stat.judge = new Date();
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
    const { address_space_limit, process_limit } = ctx.session.getLang(ctx.lang);
    const content = `#!/bin/bash
for i in {1..10}; do
    ${executeGenerator.execute} $i >$i.in
done
for i in *.in; do
    [ -f "$i" ] || break
    ${executeStd.execute} <$i >\${i%.in}.out
done
zip data.zip *
ls`;
    const res = await runQueued(
        '/bin/bash run.sh',
        {
            stdin: { content: ctx.input },
            copyIn: {
                ...executeGenerator.copyIn,
                ...executeStd.copyIn,
                'run.sh': { content },
            },
            copyOut: ['data.zip'],
            time: parseTimeMS('20s'),
            memory: parseMemoryMB('256m'),
            addressSpaceLimit: address_space_limit,
            processLimit: process_limit,
        },
        1,
    );
    ctx.clean.push(() => {
        if (fs.existsSync(tmp)) fs.removeSync(tmp);
        return res.fileIds['data.zip'] ? client.deleteFile(res.fileIds['data.zip']) : Promise.resolve();
    });
    const {
        code, signalled, time, memory, fileIds,
    } = res;
    let { status } = res;
    const message: string[] = [];
    if (time > parseTimeMS(ctx.config.time || '20s')) {
        status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
    } else if (memory > parseMemoryMB('256m') * 1024) {
        status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
    } else if (code) {
        status = STATUS.STATUS_RUNTIME_ERROR;
        if (code < 32 && signalled) message.push(`ExitCode: ${code} (${signals[code]})`);
        else message.push(`ExitCode: ${code}`);
    }
    message.push(res.stdout, res.stderr);
    ctx.next({
        status: status === STATUS.STATUS_ACCEPTED ? STATUS.STATUS_JUDGING : status,
        time: Math.floor(time * 1000000) / 1000000,
        memory,
        message: status === STATUS.STATUS_ACCEPTED ? 'Uploading...' : '',
        score: 0,
        case: {
            id: 1,
            subtaskId: 0,
            status,
            score: 100,
            time,
            memory,
            message: message.join('\n').substring(0, 102400),
        },
    });
    if (status === STATUS.STATUS_ACCEPTED) {
        await client.getFile(fileIds['data.zip'], tmp);
        // TODO pipe directly instead of writing to disk
        await ctx.session.postFile(ctx.request.rid.toString(), tmp);
    }
    ctx.stat.done = new Date();
    if (process.env.DEV) ctx.next({ message: JSON.stringify(ctx.stat) });
    ctx.end({ status: STATUS.STATUS_ACCEPTED });
};
