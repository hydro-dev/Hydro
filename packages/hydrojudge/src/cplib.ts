import { camelCase } from '@hydrooj/utils';
import { STATUS } from '@hydrooj/utils/lib/status';
import { IncompleteTrace as IncompleteTraceHydro, TraceStack as TraceStackHydro } from 'hydrooj';

export interface IncompleteTrace {
    var_name: string;
    line_num: number;
    col_num: number;
    byte_num: number;
}

export interface CompleteTrace {
    n: string;
    b: number;
    l: number;
}

export interface TraceStack {
    stream_name: string;
    stack: IncompleteTrace[];
}

export type Tag =
    | string
    | number
    | boolean
    | { [property: string]: Tag }
    | Tag[];

export interface TraceTreeNode {
    trace: CompleteTrace;
    tag?: Record<string, Tag>;
    children?: TraceTreeNode[];
}

export type CheckerStatus = 'internal_error' | 'accepted' | 'wrong_answer' | 'partially_correct';

export type ValidatorStatus = 'internal_error' | 'valid' | 'invalid';

export interface CheckerReport {
    status: CheckerStatus;
    message?: string;
    score: number;
    reader_trace_stack?: TraceStack;
}

export interface ValidatorReport {
    status: ValidatorStatus;
    message?: string;
    reader_trace_stack?: TraceStack;
    reader_trace_tree?: TraceTreeNode[];
}

function convertIncompleteTrace(trace: IncompleteTrace): IncompleteTraceHydro {
    return {
        varName: trace.var_name,
        pos: {
            line: trace.line_num,
            col: trace.col_num,
            byte: trace.byte_num,
        },
    };
}

function convertTraceStack(traceStack: TraceStack): TraceStackHydro {
    return {
        streamName: camelCase(traceStack.stream_name),
        stack: traceStack.stack.map(convertIncompleteTrace),
    };
}

export function parse(output: string, fullScore: number)
    : { status: STATUS, score: number, scaledScore: number, message: string, traceStack?: TraceStackHydro } {
    const report = JSON.parse(output) as CheckerReport;

    let status: STATUS;
    const scaledScore = report.score ?? 0;
    const message = report.message ?? '';

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

    return {
        status,
        score: scaledScore * fullScore,
        scaledScore,
        message,
        traceStack: report.reader_trace_stack ? convertTraceStack(report.reader_trace_stack) : undefined,
    };
}
