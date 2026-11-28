import { verdicts } from './scoring';

export function submissionFilters(query: Record<string, unknown>, pids: number[]) {
    const read = (key: string) => {
        const value = query[key];
        if (value === undefined) return '';
        if (typeof value !== 'string' || value.length > 128) throw new Error(key);
        return value;
    };
    const page = Number(read('page') || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) throw new Error('page');
    const show = read('show') || 'all';
    if (!['all', 'unjudged', 'judging'].includes(show)) throw new Error('show');
    const team = read('team');
    if (team && (!/^-?[1-9]\d*$/.test(team) || !Number.isSafeInteger(+team))) throw new Error('team');
    const problem = read('problem');
    if (problem && !pids.some((pid) => String(pid) === problem)) throw new Error('problem');
    const language = read('language');
    if (language && !/^[\w.+#-]{1,64}$/.test(language)) throw new Error('language');
    const result = read('result');
    if (result && !Object.hasOwn(verdicts, result)) throw new Error('result');
    return { page, show, team, problem, language, result };
}

export function submissionFilterQuery(filters: ReturnType<typeof submissionFilters>, members?: number[]) {
    const query: Record<string, any> = {};
    if (filters.team) query.uid = members?.length ? { $in: members } : +filters.team;
    if (filters.problem) query.pid = +filters.problem;
    if (filters.language) query.lang = filters.language;
    const statuses = [];
    if (filters.show === 'unjudged') statuses.push({ status: { $in: [0, 22] } });
    if (filters.show === 'judging') statuses.push({ status: { $in: [20, 21] } });
    if (filters.result) statuses.push({ status: +filters.result });
    if (statuses.length) query.$and = statuses;
    return query;
}

// Only public case identifiers and verdicts belong in the list, never diagnostics or source code.
export function submissionChecks(cases: { id?: number, subtaskId?: number, status: number }[] = []) {
    const symbols = { 1: '✓', 2: 'w', 3: 't', 4: 'm', 5: 'o', 6: 'r', 7: 'c', 11: 'w', 20: '…', 21: '…' };
    return cases.map((item, index) => ({
        id: Number.isSafeInteger(item.id) && item.id >= 0 ? item.id : index + 1,
        subtask: Number.isSafeInteger(item.subtaskId) && item.subtaskId >= 0 ? item.subtaskId : 0,
        verdict: verdicts[item.status] || 'JUDGE-ERROR',
        symbol: symbols[item.status] || '×',
        style: item.status === 1 ? 'success' : [2, 3, 4, 5, 6, 7, 11].includes(item.status)
            ? 'danger' : [0, 20, 21, 22].includes(item.status) ? 'warning' : 'secondary',
    })).sort((a, b) => a.subtask - b.subtask || a.id - b.id);
}
