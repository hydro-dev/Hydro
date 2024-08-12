import { camelCase } from '@hydrooj/utils';
import { STATUS } from '@hydrooj/utils/lib/status';
import { PartialFragment } from './checkers';

export interface Position {
    line: number;
    col: number;
    byte: number;
}

export interface IncompleteTrace {
    var_name: string;
    pos: Position;
}

export interface TraceStack {
    stack: IncompleteTrace[];
    fatal: boolean,
}

export interface Fragment {
    pos: Position;
    dir: 'after' | 'around' | 'before';
    highlight_lines: number[];
}

export type CheckerStatus = 'internal_error' | 'accepted' | 'wrong_answer' | 'partially_correct';

export interface CheckerReport {
    status: CheckerStatus;
    message?: string;
    score: number;
    reader_trace_stacks?: Record<string, TraceStack>;
    reader_fragments?: Record<string, Fragment>;
}

export function parse(output: string, fullScore: number)
    : { status: STATUS, score: number, scaledScore: number, message: string, fragments: Record<string, PartialFragment> } {
    const report = JSON.parse(output) as CheckerReport;

    let status: STATUS;
    const scaledScore = report.score ?? 0;
    let message = report.message ? `${report.message}\n` : '';

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
                status: STATUS.STATUS_SYSTEM_ERROR, score: 0, scaledScore: 0, message: `invalid status ${report.status}`, fragments: {},
            };
    }

    if (report.reader_trace_stacks && Object.keys(report.reader_trace_stacks).length) {
        message += '\nReader trace stacks (most recent variable last):';

        for (const [stream, trace] of Object.entries(report.reader_trace_stacks)) {
            message += `\n  Stream: \x1b[0;33m${stream}\x1b[0m`;
            if (trace.fatal) {
                message += ' \x1b[0;31m[fatal]\x1b[0m';
            }
            message = trace.stack.reduce((str: string, {
                var_name: v, pos: { line: l, col: c, byte: b },
            }, idx) =>
                (`${str}\n  ${idx}: \x1b[0;33m${v}\x1b[0m @ line \x1b[0;33m${l}\x1b[0m, col \x1b[0;33m${c}\x1b[0m, byte \x1b[0;33m${b}\x1b[0m`),
                message);
            message += '\n';
        }
    }

    const fragments: Record<string, PartialFragment> = Object.entries(report.reader_fragments || {}).reduce((obj, [stream, fragment]) => {
        const value: PartialFragment = {
            byteIdx: fragment.pos.byte,
            dir: fragment.dir,
            highlightLines: fragment.highlight_lines,
        };
        obj[camelCase(stream)] = value;
        return obj;
    }, {});

    return {
        status,
        score: scaledScore * fullScore,
        scaledScore,
        message,
        fragments,
    };
}
