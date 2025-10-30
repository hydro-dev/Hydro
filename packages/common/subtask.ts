import { parseMemoryMB, parseTimeMS, sortFiles } from '@hydrooj/utils/lib/common';

export function convertIniConfig(ini: string) {
    const f = ini.split('\n');
    const count = Number.parseInt(f[0], 10);
    const res = { subtasks: [] };
    for (let i = 1; i <= count; i++) {
        if (!f[i]?.trim()) throw new Error('Testdata count incorrect.');
        const [input, output, time, score, memory] = f[i].split('|');
        const cur = {
            cases: [{ input, output }],
            score: Number.parseInt(score, 10),
            time: `${time}s`,
            memory: '256m',
        };
        if (!Number.isNaN(Number.parseInt(memory, 10))) cur.memory = `${Math.floor(Number.parseInt(memory, 10) / 1024)}m`;
        res.subtasks.push(cur);
    }
    return res;
}

interface MatchRule {
    regex: RegExp;
    output: (a: RegExpExecArray) => string[];
    id: (a: RegExpExecArray) => number;
    subtask: (a: RegExpExecArray) => number;
    preferredScorerType: (a: RegExpExecArray) => 'min' | 'max' | 'sum';
}

const SubtaskMatcher: MatchRule[] = [
    {
        // eslint-disable-next-line regexp/no-super-linear-backtracking
        regex: /^(([\w.-]*?)(?:(\d*)[-_])?(\d+))\.(in|IN|txt|TXT|in\.txt|IN\.TXT)$/,
        output: (a) => ['out', 'ans']
            .flatMap((i) => [i, i.toUpperCase(), `${i}.txt`, `${i.toUpperCase()}.TXT`])
            .flatMap((i) => [`${a[1]}.${i}`, `${a[1]}.${i}`.replace(/input/g, 'output').replace(/INPUT/g, 'OUTPUT')])
            .concat(a[1].includes('input') ? `${a[1]}.txt`.replace(/input/g, 'output') : null),
        id: (a) => +a[4],
        subtask: (a) => +(a[3] || 1),
        preferredScorerType: (a) => (a[3] ? 'min' : 'sum'),
    },
    {
        regex: /^(\D*)\.(in|IN)(\d+)$/,
        output: (a) => [
            `${a[1]}.${a[2] === 'in' ? 'ou' : 'OU'}${a[3]}`,
            `${a[1]}.${a[2] === 'in' ? 'out' : 'OUT'}${a[3]}`,
        ].flatMap((i) => [i, i.replace(/input/g, 'output').replace(/INPUT/g, 'OUTPUT')]),
        id: (a) => +a[2],
        subtask: () => 1,
        preferredScorerType: () => 'sum',
    },
    {
        regex: /^(\D*)([0-9]+)([-_])([0-9]+)\.(in|IN)$/,
        output: (a) => ['out', 'ans', 'OUT', 'ANS'].flatMap((i) => `${a[1]}${a[2]}${a[3]}${a[4]}.${i}`),
        id: (a) => +a[4],
        subtask: (a) => +a[2],
        preferredScorerType: () => 'min',
    },
    {
        regex: /^(([0-9]+)[-_].*)\.(in|IN)$/,
        output: (a) => ['out', 'ans', 'OUT', 'ANS'].flatMap((i) => `${a[1]}.${i}`),
        id: (a) => +a[2],
        subtask: () => 1,
        preferredScorerType: () => 'sum',
    },
];

function* getScore(totalScore: number, count: number) {
    const base = Math.floor(totalScore / count);
    const extra = count - (totalScore % count);
    for (let i = 0; i < count; i++) {
        if (i >= extra) yield base + 1;
        else yield base;
    }
}

interface ParsedCase {
    id?: number;
    time?: number | string;
    memory?: number | string;
    score?: number;
    input?: string;
    output?: string;
}
interface ParsedSubtask {
    cases: ParsedCase[];
    type: 'min' | 'max' | 'sum';
    time?: number | string;
    memory?: number | string;
    score?: number;
    id?: number;
    if?: number[];
}

export function readSubtasksFromFiles(files: string[], config) {
    const subtask: Record<number, ParsedSubtask> = {};
    for (const s of config.subtasks || []) if (s.id) subtask[s.id] = s;
    for (const file of files) {
        let match = false;
        for (const rule of SubtaskMatcher) {
            const data = rule.regex.exec(file);
            if (!data) continue;
            const sid = rule.subtask(data);
            const c = { input: file, output: '', id: rule.id(data) };
            const type = rule.preferredScorerType(data);
            const outputs = (config.noOutputFile ? ['/dev/null'] : rule.output(data)).filter((i) => i);
            for (const output of outputs) {
                if (output === file) continue;
                if (output === '/dev/null' || files.includes(output)) {
                    match = true;
                    c.output = output;
                    if (!subtask[sid]) {
                        subtask[sid] = {
                            time: config.time,
                            memory: config.memory,
                            type,
                            cases: [c],
                            id: sid,
                        };
                    } else if (!subtask[sid].cases) subtask[sid].cases = [c];
                    else if (!subtask[sid].cases.find((i) => i.input === c.input && i.output === c.output)) {
                        subtask[sid].cases.push(c);
                    }
                    break;
                }
            }
            if (match) break;
        }
    }
    for (const id in subtask) subtask[id].cases = sortFiles(subtask[id].cases, 'input');
    return Object.values(subtask);
}

export interface NormalizedCase extends Required<ParsedCase> {
    time: number;
    memory: number;
}
export interface NormalizedSubtask extends Required<ParsedSubtask> {
    cases: NormalizedCase[];
    time: number;
    memory: number;
}

export function normalizeSubtasks(
    subtasks: ParsedSubtask[], checkFile: (name: string, errMsg: string) => string,
    time: number | string = '1000ms', memory: number | string = '256m', ignoreParseError = false,
    timeRate = 1, memoryRate = 1,
): NormalizedSubtask[] {
    subtasks.sort((a, b) => (a.id - b.id));
    const subtaskScore = getScore(
        Math.max(100 - Math.sum(subtasks.map((i) => i.score || 0)), 0),
        subtasks.filter((i) => !i.score).length,
    );
    return subtasks.map((s, id) => {
        s.cases.sort((a, b) => (a.id - b.id));
        const score = s.score || subtaskScore.next().value as number;
        const caseScore = getScore(
            Math.max(score - Math.sum(s.cases.map((i) => i.score || 0)), 0),
            s.cases.filter((i) => !i.score).length,
        );
        return {
            id: id + 1,
            type: 'min',
            if: [],
            ...s,
            score,
            time: parseTimeMS(s.time || time, !ignoreParseError) * timeRate,
            memory: parseMemoryMB(s.memory || memory, !ignoreParseError) * memoryRate,
            cases: s.cases.map((c, index) => ({
                id: index + 1,
                ...c,
                score: c.score || (s.type === 'sum' ? caseScore.next().value as number : score),
                time: parseTimeMS(c.time || s.time || time, !ignoreParseError) * timeRate,
                memory: parseMemoryMB(c.memory || s.memory || memory, !ignoreParseError) * memoryRate,
                input: c.input ? checkFile(c.input, 'Cannot find input file {0}.') : '/dev/null',
                output: c.output ? checkFile(c.output, 'Cannot find output file {0}.') : '/dev/null',
            })) as NormalizedCase[],
        };
    });
}
