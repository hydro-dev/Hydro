import { beijingDay } from './externalOjStats';

export const EXTERNAL_PLATFORMS = Object.freeze(['codeforces', 'atcoder', 'nowcoder', 'luogu', 'leetcode'] as const);
export type ExternalPlatform = typeof EXTERNAL_PLATFORMS[number];
// eslint-disable-next-line ts/consistent-type-definitions -- Public type alias for the adapter result.
export type ExternalStats = {
    total: number;
    solves?: { problem: string, at: Date }[];
    olderSolved?: string[];
};

interface Previous {
    solves?: ExternalStats['solves'];
    olderSolved?: string[];
    cursorAt?: Date;
    lastSuccessAt?: Date;
}

type BeforeRequest = () => Promise<void>;
interface FetchOptions {
    now?: Date;
    beforeRequest?: BeforeRequest;
}

// null is an older first AC whose exact date is no longer needed.
type FirstAc = Map<string, Date | null>;

const HANDLE_PATTERN: Record<ExternalPlatform, RegExp> = {
    codeforces: /^[A-Za-z0-9_.-]{1,64}$/,
    atcoder: /^[A-Za-z0-9_]{1,64}$/,
    nowcoder: /^[0-9]{1,32}$/,
    luogu: /^[0-9]{1,32}$/,
    leetcode: /^[A-Za-z0-9_-]{1,64}$/,
};

const PROFILE_PATHS: Record<ExternalPlatform, Record<string, RegExp>> = {
    codeforces: { 'codeforces.com': /^\/profile\/([^/]+)\/?$/ },
    atcoder: { 'atcoder.jp': /^\/users\/([^/]+)\/?$/ },
    nowcoder: {
        'ac.nowcoder.com': /^\/acm\/contest\/profile\/([^/]+)(?:\/practice-coding)?\/?$/,
        'www.nowcoder.com': /^\/users\/([^/]+)\/?$/,
    },
    luogu: { 'www.luogu.com.cn': /^\/user\/([^/]+)\/?$/, 'luogu.com.cn': /^\/user\/([^/]+)\/?$/ },
    leetcode: { 'leetcode.cn': /^\/u\/([^/]+)\/?$/ },
};

export function externalOjHandle(platform: ExternalPlatform, handle: string): string {
    if (!EXTERNAL_PLATFORMS.includes(platform)) throw new Error('Unsupported external platform');
    let value = typeof handle === 'string' ? handle.trim() : '';
    if (/^https?:\/\//i.test(value)) {
        const url = new URL(value);
        const paths = PROFILE_PATHS[platform];
        value = !url.username && !url.password && !url.port && Object.hasOwn(paths, url.hostname)
            ? paths[url.hostname].exec(url.pathname)?.[1] || ''
            : '';
    }
    if (HANDLE_PATTERN[platform].test(value) && /[A-Za-z0-9]/.test(value)) {
        if (platform !== 'nowcoder' && platform !== 'luogu') return value;
        const uid = Number(value);
        if (Number.isSafeInteger(uid) && uid > 0) return String(uid);
    }
    throw new Error(`Malformed ${platform} account handle`);
}

export function externalAccountKey(platform: ExternalPlatform, handle: string): string {
    return `${platform}:${externalOjHandle(platform, handle).toLowerCase()}`;
}

export function externalOjProfileUrl(platform: ExternalPlatform, handle: string): string {
    const value = encodeURIComponent(externalOjHandle(platform, handle));
    switch (platform) {
        case 'codeforces': return `https://codeforces.com/profile/${value}`;
        case 'atcoder': return `https://atcoder.jp/users/${value}`;
        case 'nowcoder': return `https://ac.nowcoder.com/acm/contest/profile/${value}/practice-coding`;
        case 'luogu': return `https://www.luogu.com.cn/user/${value}`;
        case 'leetcode': return `https://leetcode.cn/u/${value}/`;
        default: throw new Error('Unsupported external platform');
    }
}

export function externalOjActivityUrl(platform: ExternalPlatform, handle: string): string | undefined {
    return platform === 'atcoder'
        ? `https://kenkoooo.com/atcoder/#/user/${encodeURIComponent(externalOjHandle(platform, handle))}`
        : undefined;
}

// Shared across accounts in this process. Codeforces allows one request per two
// seconds; AtCoder Problems asks callers to wait more than one second.
const requestInterval: Record<ExternalPlatform, number> = {
    codeforces: 2100, atcoder: 1100, nowcoder: 1000, luogu: 1000, leetcode: 1000,
};
const gates = new Map<ExternalPlatform, { tail: Promise<void>, nextStart: number }>();
const REQUEST_TIMEOUT_MS = 10_000;
const PAGE_CAP = 32;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export class ExternalOjRateLimit extends Error {
    constructor(readonly retryMs: number = 30 * 60 * 1000) {
        super('Upstream rate limit');
    }
}

export class ExternalOjHistoryLimit extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ExternalOjHistoryLimit';
    }
}

function retryDelay(value: string | null) {
    if (!value) return undefined;
    const millis = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
    return Number.isNaN(millis) ? undefined : Math.min(DAY_MS, Math.max(60_000, millis));
}

function reserveRequest(platform: ExternalPlatform, beforeRequest?: BeforeRequest) {
    let gate = gates.get(platform);
    if (!gate) {
        gate = { tail: Promise.resolve(), nextStart: 0 };
        gates.set(platform, gate);
    }
    const slot = gate.tail.then(async () => {
        const wait = Math.ceil(gate.nextStart - performance.now());
        if (wait > 0) await new Promise<void>((resolve) => { setTimeout(resolve, wait); });
        // Keep the slot until quota resolves so concurrent fetches stay spaced.
        await beforeRequest?.();
        gate.nextStart = performance.now() + requestInterval[platform];
    });
    gate.tail = slot.catch(() => {});
    return slot;
}

async function publicResponse(platform: ExternalPlatform, url: URL, beforeRequest?: BeforeRequest, body?: string): Promise<string> {
    await reserveRequest(platform, beforeRequest);
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: body ? 'POST' : 'GET',
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body,
            signal,
            credentials: 'omit',
            redirect: 'error',
        });
        if (res.status === 429 || (res.status === 503 && res.headers.has('Retry-After'))) {
            throw new ExternalOjRateLimit(retryDelay(res.headers.get('Retry-After')));
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } catch (cause) {
        if (cause instanceof ExternalOjRateLimit) throw cause;
        const reason = signal.aborted ? 'request timed out' : (cause as Error).message;
        throw new Error(`${platform}: ${reason}`, { cause });
    }
}

function endpoint(source: string, params: Record<string, string>) {
    const url = new URL(source);
    url.search = new URLSearchParams(params).toString();
    return url;
}

function obj(x: unknown): Record<string, unknown> {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('Invalid upstream object');
    return x as Record<string, unknown>;
}

function page(x: unknown, max: number): unknown[] {
    if (!Array.isArray(x) || x.length > max) throw new Error('Invalid upstream submissions page');
    return x;
}

function count(x: unknown): number {
    if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < 0) throw new Error('Invalid or unavailable upstream count');
    return x;
}

function positive(x: unknown): number {
    const value = count(x);
    if (!value) throw new Error('Invalid upstream ID or timestamp');
    return value;
}

function token(x: unknown, pattern: RegExp): string {
    if (typeof x !== 'string' || !pattern.test(x)) throw new Error('Invalid upstream string');
    return x;
}

function historyCursor(now: Date, previous?: Previous): number | undefined {
    const cursor = (previous?.cursorAt || previous?.lastSuccessAt)?.getTime();
    return cursor !== undefined && Number.isFinite(cursor) && cursor > 0 && cursor <= +now ? cursor : undefined;
}

function historyStart(cursor: number | undefined, overlapMs: number): number {
    return cursor === undefined ? 0 : Math.max(0, Math.floor((cursor - overlapMs) / 1000));
}

function remember(solves: FirstAc, problem: string, at: Date) {
    const prior = solves.get(problem);
    if (prior === undefined || (prior !== null && at < prior)) solves.set(problem, at);
}

function initialHistory(previous?: Previous): FirstAc {
    const solves: FirstAc = new Map();
    for (const problem of previous?.olderSolved || []) solves.set(problem, null);
    for (const { problem, at } of previous?.solves || []) remember(solves, problem, new Date(at.getTime()));
    return solves;
}

function timestamp(seconds: unknown): Date {
    const at = new Date(positive(seconds) * 1000);
    if (!Number.isFinite(at.getTime())) throw new TypeError('Invalid upstream timestamp');
    return at;
}

function historyResult(problems: FirstAc, now: Date): ExternalStats {
    const firstDay = beijingDay(new Date(+now - 364 * DAY_MS));
    const cutoff = Date.parse(`${firstDay}T00:00:00+08:00`);
    const solves: NonNullable<ExternalStats['solves']> = [];
    const olderSolved: string[] = [];
    for (const [problem, at] of problems) {
        if (at === null || +at < cutoff) olderSolved.push(problem);
        else solves.push({ problem, at });
    }
    solves.sort((a, b) => +a.at - +b.at || (a.problem < b.problem ? -1 : Number(a.problem > b.problem)));
    olderSolved.sort();
    return { total: solves.length + olderSolved.length, solves, olderSolved };
}

const CF_STATUS = 'https://codeforces.com/api/user.status';
async function codeforces(handle: string, previous: Previous | undefined, { now = new Date(), beforeRequest }: FetchOptions): Promise<ExternalStats> {
    const cursor = historyCursor(now, previous);
    const since = historyStart(cursor, 6 * HOUR_MS);
    const pageSize = cursor !== undefined && +now - cursor <= 48 * HOUR_MS ? 100 : 500;
    const solves = initialHistory(previous);
    let lastId = Infinity;
    let lastTime = Infinity;
    let from = 1;
    for (let i = 0; i < PAGE_CAP; i++) {
        const url = endpoint(CF_STATUS, { handle, from: String(from), count: String(pageSize) });
        // eslint-disable-next-line no-await-in-loop -- Offset pagination must check the preceding page boundary.
        const body = obj(JSON.parse(await publicResponse('codeforces', url, beforeRequest)));
        if (body.status !== 'OK') {
            if (typeof body.comment === 'string' && /call limit exceeded/i.test(body.comment)) throw new ExternalOjRateLimit();
            throw new Error('Codeforces submissions request failed');
        }
        const rows = page(body.result, pageSize);
        if (i && (!rows.length || obj(rows[0]).id !== lastId)) throw new Error('Codeforces pagination changed during fetch');
        for (let row = i ? 1 : 0; row < rows.length; row++) {
            const submission = obj(rows[row]);
            const id = positive(submission.id);
            const at = timestamp(submission.creationTimeSeconds);
            const seconds = +at / 1000;
            if (id >= lastId || (since && seconds > lastTime)) throw new Error('Codeforces pagination is out of order');
            lastId = id;
            lastTime = seconds;
            if (seconds < since || submission.verdict === undefined
                || token(submission.verdict, /^[A-Z_]+$/) !== 'OK') continue;
            // A verdict of OK on samples or pretests is not a final acceptance.
            const testset = token(submission.testset, /^(?:SAMPLES|PRETESTS|CHALLENGES|TESTS(?:[1-9]|10)?)$/);
            if (!testset.startsWith('TESTS')) continue;
            const problem = obj(submission.problem);
            const index = token(problem.index, /^[A-Za-z0-9]+$/);
            const set = problem.contestId === undefined
                ? token(problem.problemsetName, /^[A-Za-z][A-Za-z0-9_-]*$/)
                : positive(problem.contestId);
            remember(solves, `${set}:${index}`, at);
        }
        if (rows.length < pageSize || lastTime < since) return historyResult(solves, now);
        // One overlapping submission detects shifts in the offset caused by new inserts or deletions.
        from += pageSize - 1;
    }
    throw new ExternalOjHistoryLimit('Codeforces history exceeded the page cap');
}

const AT_PAGE_SIZE = 500;
const AT_SUBMISSIONS = 'https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions';
async function atcoder(handle: string, previous: Previous | undefined, { now = new Date(), beforeRequest }: FetchOptions): Promise<ExternalStats> {
    const cursor = historyCursor(now, previous);
    let from = historyStart(cursor, DAY_MS);
    const solves = initialHistory(previous);
    let boundary = new Map<number, string>();
    for (let i = 0; i < PAGE_CAP; i++) {
        const url = endpoint(AT_SUBMISSIONS, { user: handle, from_second: String(from) });
        // eslint-disable-next-line no-await-in-loop -- Each page determines the next inclusive timestamp.
        const rows = page(JSON.parse(await publicResponse('atcoder', url, beforeRequest)), AT_PAGE_SIZE);
        if (!rows.length && cursor === undefined && !from) throw new Error('No public submissions to verify the AtCoder account');
        let second = from;
        let atSecond = new Map<number, string>();
        const ids = new Set<number>();
        for (const row of rows) {
            const submission = obj(row);
            const id = positive(submission.id);
            const at = timestamp(submission.epoch_second);
            const seconds = +at / 1000;
            const user = token(submission.user_id, HANDLE_PATTERN.atcoder);
            const verdict = token(submission.result, /\S/);
            const problem = token(submission.problem_id, /^[A-Za-z0-9_-]+$/);
            if (user.toLowerCase() !== handle || seconds < second || ids.has(id)) {
                throw new Error('Invalid AtCoder submissions pagination');
            }
            ids.add(id);
            if (seconds > second) {
                second = seconds;
                atSecond = new Map();
            }
            const signature = `${problem}:${verdict}`;
            atSecond.set(id, signature);
            if (seconds === from && boundary.has(id)) {
                if (boundary.get(id) !== signature) throw new Error('AtCoder pagination changed during fetch');
                boundary.delete(id);
            }
            if (verdict === 'AC') remember(solves, problem, at);
        }
        if (boundary.size) throw new Error('AtCoder pagination changed during fetch');
        if (rows.length < AT_PAGE_SIZE) return historyResult(solves, now);
        if (second === from) throw new ExternalOjHistoryLimit('AtCoder pagination cannot advance past a saturated second');
        // The endpoint is inclusive. Re-read the entire boundary second rather than lose ties.
        from = second;
        boundary = atSecond;
    }
    throw new ExternalOjHistoryLimit('AtCoder history exceeded the page cap');
}

async function nowcoder(handle: string, beforeRequest?: BeforeRequest): Promise<ExternalStats> {
    const path = `/acm/contest/profile/${handle}/practice-coding`;
    const html = await publicResponse('nowcoder', new URL(path, 'https://ac.nowcoder.com'), beforeRequest);
    const menu = /<ul class="profile-menu">([\s\S]*?)<\/ul>/.exec(html)?.[1];
    if (!menu?.includes(`href="${path}"`)) throw new Error('Nowcoder practice profile not found');
    const matches = Array.from(html.matchAll(
        /<div class="my-state-item"[^>]*>\s*<div class="state-num">\s*(\d+)\s*<\/div>\s*<span>\s*题已通过\s*<\/span>\s*<\/div>/g,
    ));
    if (matches.length !== 1) throw new Error('Nowcoder practice count unavailable');
    return { total: count(Number(matches[0][1])) };
}

async function luogu(handle: string, beforeRequest?: BeforeRequest): Promise<ExternalStats> {
    const url = new URL(`/user/${handle}`, 'https://www.luogu.com.cn');
    const html = await publicResponse('luogu', url, beforeRequest);
    const context = /<script\b(?=[^>]*\sid=["']lentille-context["'])(?=[^>]*\stype=["']application\/json["'])[^>]+>([\s\S]*?)<\/script\s*>/i;
    const embedded = context.exec(html);
    if (!embedded) throw new Error('Luogu profile data unavailable');
    const profile = obj(JSON.parse(embedded[1]));
    if (profile.status !== 200 || profile.template !== 'user.show') throw new Error('Luogu profile unavailable');
    const user = obj(obj(profile.data).user);
    if (user.uid !== Number(handle)) throw new Error('Luogu profile ID mismatch');
    return { total: count(user.passedProblemCount) };
}

const LEETCODE_PROGRESS = 'userProfileUserQuestionProgressV2';
async function leetcode(handle: string, beforeRequest?: BeforeRequest): Promise<ExternalStats> {
    const url = new URL('https://leetcode.cn/graphql/');
    const request = JSON.stringify({
        operationName: LEETCODE_PROGRESS,
        query: `query ${LEETCODE_PROGRESS}($userSlug: String!) {
            ${LEETCODE_PROGRESS}(userSlug: $userSlug) { numAcceptedQuestions { difficulty count } }
        }`,
        variables: { userSlug: handle },
    });
    const payload = obj(JSON.parse(await publicResponse('leetcode', url, beforeRequest, request)));
    if (payload.errors !== undefined && (!Array.isArray(payload.errors) || payload.errors.length)) {
        throw new Error('LeetCode CN rejected the profile progress query');
    }
    const entries = obj(obj(payload.data)[LEETCODE_PROGRESS]).numAcceptedQuestions;
    if (!Array.isArray(entries)) throw new TypeError('LeetCode CN accepted counts unavailable');
    const required = new Set(['EASY', 'MEDIUM', 'HARD']);
    let total = 0;
    for (const entry of entries) {
        const bucket = obj(entry);
        if (typeof bucket.difficulty !== 'string' || !required.delete(bucket.difficulty)) {
            throw new Error('Invalid LeetCode CN difficulty breakdown');
        }
        total += count(bucket.count);
    }
    if (required.size) throw new Error('Incomplete LeetCode CN difficulty breakdown');
    return { total: count(total) };
}

export async function fetchExternalStats(
    platform: ExternalPlatform, handle: string, previous?: Previous, options: FetchOptions = {},
): Promise<ExternalStats> {
    const value = externalOjHandle(platform, handle).toLowerCase();
    switch (platform) {
        case 'codeforces': return codeforces(value, previous, options);
        case 'atcoder': return atcoder(value, previous, options);
        case 'nowcoder': return nowcoder(value, options.beforeRequest);
        case 'luogu': return luogu(value, options.beforeRequest);
        case 'leetcode': return leetcode(value, options.beforeRequest);
        default: throw new Error('Unsupported external platform');
    }
}
