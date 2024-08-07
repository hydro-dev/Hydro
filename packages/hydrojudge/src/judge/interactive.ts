import { readFile } from 'fs/promises';
import { STATUS } from '@hydrooj/utils/lib/status';
import { TraceStack } from 'hydrooj';
import { parse as parseCplib } from '../cplib';
import { FormatError } from '../error';
import { runFlow } from '../flow';
import { del, get, runPiped } from '../sandbox';
import signals from '../signals';
import { parse as parseTestlib } from '../testlib';
import { fileKeepAround, NormalizedCase } from '../utils';
import { Context, ContextSubTask } from './interface';

async function judgeTestlib(c: NormalizedCase, ctx: Context, ctxSubtask: ContextSubTask) {
    const { address_space_limit, process_limit } = ctx.session.getLang(ctx.lang);
    const [{
        code, signalled, time, memory,
    }, resInteractor] = await runPiped(
        {
            execute: ctx.executeUser.execute,
            copyIn: ctx.executeUser.copyIn,
            time: c.time,
            memory: c.memory,
            addressSpaceLimit: address_space_limit,
            processLimit: process_limit,
        },
        {
            execute: `${ctx.executeInteractor.execute} /w/in /w/tout /w/out`,
            copyIn: {
                in: c.input ? { src: c.input } : { content: '' },
                out: c.output ? { src: c.output } : { content: '' },
                ...ctx.executeInteractor.copyIn,
            },
            time: c.time * 2,
            memory: c.memory * 2,
            copyOut: ['/w/tout?'],
            env: { ...ctx.env, HYDRO_TESTCASE: c.id.toString() },
        },
    );
    // TODO handle tout (maybe pass to checker?)
    let status: number;
    let score = 0;
    let scaledScore = 0;
    let message: any = '';
    const detail = ctx.config.detail ?? true;
    if (time > c.time) {
        status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
    } else if (memory > c.memory * 1024) {
        status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
    } else if (detail && ((code && code !== 13/* Broken Pipe */) || (code === 13 && !resInteractor.code))) {
        status = STATUS.STATUS_RUNTIME_ERROR;
        if (code < 32 && signalled) message = signals[code];
        else message = { message: 'Your program returned {0}.', params: [code] };
    } else {
        const result = parseTestlib(resInteractor.stderr, c.score);
        status = result.status;
        score = result.score;
        scaledScore = result.scaledScore;
        message = result.message;
        if (resInteractor.code && !(resInteractor.stderr || '').trim().length) message += ` (Interactor exited with code ${resInteractor.code})`;
    }
    return {
        id: c.id,
        subtaskId: ctxSubtask.subtask.id,
        status,
        score,
        scaledScore,
        time,
        memory,
        message,
    };
}

async function judgeCplib(c: NormalizedCase, ctx: Context, ctxSubtask: ContextSubTask) {
    const { address_space_limit, process_limit } = ctx.session.getLang(ctx.lang);
    const [{
        code, signalled, time, memory, fileIds: fileIdsUser,
    }, resInteractor] = await runPiped(
        {
            execute: ctx.executeUser.execute,
            copyIn: ctx.executeUser.copyIn,
            time: c.time,
            memory: c.memory,
            addressSpaceLimit: address_space_limit,
            processLimit: process_limit,
            copyOutCached: ['fromUser?'],
        },
        {
            execute: `${ctx.executeInteractor.execute} /w/in --report-format=json`,
            copyIn: {
                in: c.input ? { src: c.input } : { content: '' },
                out: c.output ? { src: c.output } : { content: '' },
                ...ctx.executeInteractor.copyIn,
            },
            time: c.time * 2,
            memory: c.memory * 2,
            env: { ...ctx.env, HYDRO_TESTCASE: c.id.toString(), NO_COLOR: '1' },
            copyOutCached: ['toUser?'],
        },
    );
    const fileIds = { ...fileIdsUser, ...resInteractor.fileIds };
    let status: number;
    let score = 0;
    let scaledScore = 0;
    let message: any = '';
    let traceStack: TraceStack | undefined;
    const detail = ctx.config.detail ?? true;
    if (time > c.time) {
        status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
    } else if (memory > c.memory * 1024) {
        status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
    } else if (detail && ((code && code !== 13/* Broken Pipe */) || (code === 13 && !resInteractor.code))) {
        status = STATUS.STATUS_RUNTIME_ERROR;
        if (code < 32 && signalled) message = signals[code];
        else message = { message: 'Your program returned {0}.', params: [code] };
    } else {
        const result = parseCplib(resInteractor.stderr, c.score);
        status = result.status;
        score = result.score;
        scaledScore = result.scaledScore;
        message = result.message;
        traceStack = result.traceStack;
        if (resInteractor.code && !(resInteractor.stderr || '').trim().length) message += ` (Interactor exited with code ${resInteractor.code})`;
    }

    const [infContent, fromUserContent, toUserContent] = await Promise.all([
        readFile(c.input),
        fileIds.fromUser ? get(fileIds.fromUser) : Promise.resolve(Buffer.alloc(0)),
        fileIds.toUser ? get(fileIds.toUser) : Promise.resolve(Buffer.alloc(0)),
    ]);

    const inf = fileKeepAround(infContent,
        (!traceStack || traceStack.streamName !== 'inf' || traceStack.stack.length === 0) ? 0 : traceStack.stack.at(-1).byteNum);
    const fromUser = fileKeepAround(fromUserContent,
        (!traceStack || traceStack.streamName !== 'from_user' || traceStack.stack.length === 0) ? 0 : traceStack.stack.at(-1).byteNum);
    const toUser = fileKeepAround(toUserContent,
        (!traceStack || traceStack.streamName !== 'to_user' || traceStack.stack.length === 0) ? 0 : traceStack.stack.at(-1).byteNum);

    await Promise.allSettled(Object.values(fileIds).map((id) => del(id)));

    return {
        id: c.id,
        subtaskId: ctxSubtask.subtask.id,
        status,
        score,
        scaledScore,
        time,
        memory,
        message,
        traceStack,
        inf,
        fromUser,
        toUser,
    };
}

function judgeCase(c: NormalizedCase) {
    return async (ctx: Context, ctxSubtask: ContextSubTask) => {
        const interactorType = ctx.config.interactor_type;
        switch (interactorType) {
            case 'testlib':
                return judgeTestlib(c, ctx, ctxSubtask);
            case 'cplib':
                return judgeCplib(c, ctx, ctxSubtask);
            default:
                throw new FormatError('Unknown interactor type {0}', [interactorType]);
        }
    };
}

export const judge = async (ctx: Context) => await runFlow(ctx, {
    compile: async () => {
        [ctx.executeUser, ctx.executeInteractor] = await Promise.all([
            ctx.compile(ctx.lang, ctx.code),
            ctx.compileLocalFile('interactor', ctx.config.interactor),
        ]);
    },
    judgeCase,
});
