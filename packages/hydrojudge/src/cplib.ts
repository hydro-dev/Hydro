import { camelCase } from '@hydrooj/utils';
import { STATUS } from '@hydrooj/utils/lib/status';
import { Position } from 'hydrooj';

export interface IncompleteTrace {
    var_name: string;
    line_num: number;
    col_num: number;
    byte_num: number;
}

export interface TraceStack {
    stream_name: string;
    stack: IncompleteTrace[];
}

export type CheckerStatus = 'internal_error' | 'accepted' | 'wrong_answer' | 'partially_correct';

export interface CheckerReport {
    status: CheckerStatus;
    message?: string;
    score: number;
    reader_trace_stack?: TraceStack;
}

export function parse(output: string, fullScore: number)
    : { status: STATUS, score: number, scaledScore: number, message: string, error?: { stream: string, pos: Position } } {
    const report = JSON.parse(output) as CheckerReport;

    let status: STATUS;
    const scaledScore = report.score ?? 0;
    let message = report.message ?? '';

    switch (report.status) {
        case 'internal_error':
            status = STATUS.STATUS_SYSTEM_ERROR;
            break;
        case 'accepted':
            status = STATUS.STATUS_ACCEPTED;
            break;
        case 'wrong_answer':
            status = STATUS.STATUS_WRONG_ANSWER;
            break;
        case 'partially_correct':
            status = STATUS.STATUS_WRONG_ANSWER;
            break;
        default:
            return {
                status: STATUS.STATUS_SYSTEM_ERROR, score: 0, scaledScore: 0, message: `invalid status ${report.status}`,
            };
    }

    let error: { stream: string, pos: Position } | undefined;

    if (report.reader_trace_stack && report.reader_trace_stack.stack.length) {
        const lastTrace = report.reader_trace_stack.stack.at(-1);
        error = {
            stream: camelCase(report.reader_trace_stack.stream_name),
            pos: {
                line: lastTrace.line_num,
                col: lastTrace.col_num,
                byte: lastTrace.byte_num,
            },
        };
        message
            += `\n\nReader trace stack (most recent variable last):\n  Stream: ${report.reader_trace_stack.stream_name}\n`;

        message = report.reader_trace_stack.stack.reduce((str: string, {
            var_name: v, line_num: l, col_num: c, byte_num: b,
        }, idx) =>
            `${str}  ${idx}: \x1b[0;33m${v}\x1b[0m @ line \x1b[0;33m${l}\x1b[0m, col \x1b[0;33m${c}\x1b[0m, byte \x1b[0;33m${b}\x1b[0m\n`, message);
    }

    return {
        status,
        score: scaledScore * fullScore,
        scaledScore,
        message,
        error,
    };
}
