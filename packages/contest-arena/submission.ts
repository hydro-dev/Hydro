import { stripVTControlCharacters } from 'node:util';
import { pendingStatuses, verdicts } from './scoring';

type Message = string | { message: string, params?: string[], stack?: string };
interface CaseResult {
    id?: number;
    subtaskId?: number;
    status: number;
    time?: number;
    memory?: number;
    score?: number;
    message?: Message;
}
interface SubmissionResult {
    status: number;
    score?: number;
    time?: number;
    memory?: number;
    progress?: number;
    judgeAt?: Date;
    compilerTexts?: Message[];
    judgeTexts?: Message[];
    testCases?: CaseResult[];
    subtasks?: Record<string, { type?: string, status: number, score?: number }>;
}

export function judgeMessage(value?: Message): string {
    if (!value) return '';
    const text = typeof value === 'string'
        ? value
        : (value.message || '').replace(/\{(\d+)\}/g, (match, index) => value.params?.[Number(index)] ?? match);
    return stripVTControlCharacters(text);
}

function numeric(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function milliseconds(value: unknown) {
    const amount = numeric(value);
    return amount === null ? '—' : `${Math.round(amount)} ms`;
}

function memorySize(value: unknown) {
    // Hydro stores judge memory in KiB; the sandbox reports bytes before adaptation.
    const kibibytes = numeric(value);
    if (kibibytes === null) return '—';
    const amount = kibibytes * 1024;
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    const unit = amount ? Math.max(0, Math.min(units.length - 1, Math.floor(Math.log(amount) / Math.log(1024)))) : 0;
    return `${Number((amount / 1024 ** unit).toFixed(2))} ${units[unit]}`;
}

function compilation(status: number, requiresCompile?: boolean) {
    if (status === 7) return { text: 'failed', style: 'danger' };
    if (status === 21) return { text: 'in progress', style: 'warning' };
    if ([0, 22].includes(status)) return { text: 'not started', style: 'secondary' };
    if ([1, 2, 3, 4, 5, 6, 11, 20].includes(status)) {
        if (requiresCompile === false) return { text: 'not required', style: 'secondary' };
        if (requiresCompile === true) return { text: 'successful', style: 'success' };
    }
    return { text: 'not confirmed', style: 'secondary' };
}

function result(status: number) {
    return { status, verdict: verdicts[status] || 'JUDGE-ERROR', pending: pendingStatuses.has(status) };
}

// The caller must verify record ownership/contest access before granting detailed results.
// Do not include private diagnostics at all in a live participant's response.
export function submissionResult(rdoc: SubmissionResult, canViewDetails: boolean, requiresCompile?: boolean) {
    const basic = {
        ...result(rdoc.status),
        compiler: (rdoc.compilerTexts || []).map(judgeMessage).join('\n'),
        compilation: compilation(rdoc.status, requiresCompile),
    };
    if (!canViewDetails) return basic;
    const cases = (rdoc.testCases || []).map((item, index) => ({
        ...result(item.status),
        id: numeric(item.id) ?? index + 1,
        subtask: numeric(item.subtaskId),
        score: numeric(item.score),
        time: milliseconds(item.time),
        memory: memorySize(item.memory),
        atLeast: [3, 4, 5].includes(item.status),
        message: judgeMessage(item.message),
    })).sort((a, b) => (a.subtask ?? 0) - (b.subtask ?? 0) || a.id - b.id);
    const caseTimes = (rdoc.testCases || []).map((item) => numeric(item.time)).filter((value) => value !== null);
    return {
        ...basic,
        details: {
            score: numeric(rdoc.score),
            totalTime: milliseconds(rdoc.time),
            peakTime: milliseconds(caseTimes.length ? caseTimes.reduce((peak, value) => Math.max(peak, value), 0) : undefined),
            peakMemory: memorySize(rdoc.memory),
            progress: numeric(rdoc.progress) === null ? null : Math.min(100, rdoc.progress),
            judgedAt: rdoc.judgeAt instanceof Date && Number.isFinite(+rdoc.judgeAt) ? rdoc.judgeAt.toISOString() : '',
            cases,
            hasSubtasks: cases.some((item) => item.subtask !== null),
            subtasks: Object.entries(rdoc.subtasks || {}).map(([id, item]) => ({
                id,
                ...result(item.status),
                score: numeric(item.score),
                type: item.type || '',
            })).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })),
            messages: (rdoc.judgeTexts || []).map(judgeMessage).filter(Boolean).join('\n'),
        },
    };
}
