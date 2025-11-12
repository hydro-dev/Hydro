import path from 'path';
import { LRUCache } from 'lru-cache';
import {
    avatar, ContestModel, Context, fs, getAlphabeticId, ObjectId, PERM,
    RecordDoc, Schema, STATUS, Tdoc, Types, UserModel,
} from 'hydrooj';

const file = fs.readFileSync(path.join(__dirname, 'public/assets/board.html'), 'utf8');
const indexJs = file.match(/index-([\w-]+)\.js"/)?.[1];
const indexCss = file.match(/index-([\w-]+)\.css"/)?.[1];
const status = {
    [STATUS.STATUS_WRONG_ANSWER]: 'WRONG_ANSWER',
    [STATUS.STATUS_ACCEPTED]: 'CORRECT',
    [STATUS.STATUS_COMPILING]: 'PENDING',
    [STATUS.STATUS_WAITING]: 'PENDING',
    [STATUS.STATUS_JUDGING]: 'PENDING',
    [STATUS.STATUS_TIME_LIMIT_EXCEEDED]: 'TIME_LIMIT_EXCEEDED',
    [STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: 'MEMORY_LIMIT_EXCEEDED',
    [STATUS.STATUS_RUNTIME_ERROR]: 'RUNTIME_ERROR',
    [STATUS.STATUS_SYSTEM_ERROR]: 'SYSTEM_ERROR',
    [STATUS.STATUS_COMPILE_ERROR]: 'COMPILATION_ERROR',
    [STATUS.STATUS_FETCHED]: 'PENDING',
    [STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED]: 'OUTPUT_LIMIT_EXCEEDED',
    [STATUS.STATUS_ETC]: 'SYSTEM_ERROR',
    [STATUS.STATUS_CANCELED]: 'CANCELED',
};

function submissionBase(tdoc: Tdoc, rdoc: RecordDoc, uid?: number) {
    // NOTE: rdoc can be either record, or a tsdoc detail entry
    const submit = new ObjectId(rdoc._id || (rdoc as any).rid).getTimestamp().getTime();
    return {
        problem_id: tdoc.pids.indexOf(rdoc.pid),
        team_id: `${uid || rdoc.uid}`,
        timestamp: Math.floor(submit - tdoc.beginAt.getTime()),
        language: rdoc.lang || '',
        submission_id: rdoc._id,
    };
}

async function loadContestState(tdoc: Tdoc, realtime: boolean) {
    const tsdocs = await ContestModel.getMultiStatus(tdoc.domainId, { docId: tdoc.docId }).toArray();
    const udict = await UserModel.getList(tdoc.domainId, tsdocs.map((i) => i.uid));
    const teams = tsdocs.map((i) => {
        const udoc = udict[i.uid];
        return {
            team_id: `${udoc._id}`,
            name: udoc.uname,
            organization: udoc.school,
            members: udoc.members?.split(',').filter((t) => t) || [],
            coach: udoc.coach,
            badge: { url: avatar(udoc.avatar) },
            group: [
                ...(udoc.group || []),
                i.unrank ? 'unofficial' : 'official',
            ],
        };
    });
    return {
        submissions: tsdocs.flatMap((i) => (i.journal || []).map((j) => {
            const submit = new ObjectId(j.rid as string).getTimestamp().getTime();
            const curStatus = status[j.status] || 'SYSTEM_ERROR';
            return {
                ...submissionBase(tdoc, j, i.uid),
                status: (ContestModel.isLocked(tdoc) && submit > tdoc.lockAt.getTime() && !realtime)
                    ? 'PENDING'
                    : curStatus,
            };
        })),
        teams,
    };
}

export const name = 'scoreboard-xcpcio';
export const Config = Schema.object({
    cacheTTL: Schema.number().default(0).description('Cache TTL in milliseconds'),
    cacheSize: Schema.number().default(100).description('Cache size'),
});

export async function apply(ctx: Context, config: ReturnType<typeof Config>) {
    const lru = new LRUCache<string, Awaited<ReturnType<typeof loadContestState>>>({
        max: config.cacheSize,
        ttl: config.cacheTTL,
        // NOTE: currently we force all entries to expire
        // to make sure that any patch error won't last too long
        // can use updateAgeOnGet=false,updateAgeOnHas=false later if this patching is fully tested.
        noUpdateTTL: true,
    });

    if (config.cacheTTL) {
        ctx.on('record/judge', async (rdoc) => {
            if (!rdoc.contest) return;
            const realtime = lru.get(`${rdoc.contest.toHexString()}/realtime`);
            const pub = lru.get(`${rdoc.contest.toHexString()}/public`);
            if (!realtime && !pub) return;
            const tdoc = await ContestModel.get(rdoc.domainId, rdoc.contest);
            const submit = new ObjectId(rdoc._id).getTimestamp().getTime();
            const isLocked = ContestModel.isLocked(tdoc) && submit > tdoc.lockAt.getTime();
            const statusStr = status[rdoc.status] || 'SYSTEM_ERROR';
            if (realtime) {
                const found = realtime.submissions.find((i) => i.submission_id === rdoc._id.toHexString());
                if (found) found.status = statusStr;
                else realtime.submissions.push({ ...submissionBase(tdoc, rdoc), status: statusStr });
            }
            if (pub) {
                const found = pub.submissions.find((i) => i.submission_id === rdoc._id.toHexString());
                if (found && !isLocked) found.status = statusStr;
                else pub.submissions.push({ ...submissionBase(tdoc, rdoc), status: isLocked ? 'PENDING' : statusStr });
            }
        });
    }

    ctx.inject(['scoreboard'], ({ scoreboard }) => {
        scoreboard.addView('xcpcio', 'XCPCIO', {
            tdoc: 'tdoc',
            groups: 'groups',
            json: Types.Boolean,
            realtime: Types.Boolean,
            gold: Schema.transform(Schema.union([Schema.string(), Schema.number().step(1).min(0)]), (v) => +v).default(0),
            silver: Schema.transform(Schema.union([Schema.string(), Schema.number().step(1).min(0)]), (v) => +v).default(0),
            bronze: Schema.transform(Schema.union([Schema.string(), Schema.number().step(1).min(0)]), (v) => +v).default(0),
        }, {
            async display({
                tdoc, groups, json, realtime, gold, silver, bronze,
            }) {
                if (realtime && !this.user.own(tdoc)) this.checkPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
                if (json || this.request.json) {
                    const isLocked = ContestModel.isLocked(tdoc);
                    const cacheKey = `${tdoc.docId.toHexString()}/${(isLocked && realtime) ? 'realtime' : 'public'}`;
                    const state = lru.get(cacheKey) || await loadContestState(tdoc, realtime);
                    if (config.cacheTTL) lru.set(cacheKey, state);
                    const relatedGroups = state.teams.flatMap((i) => i.group);
                    this.response.body = {
                        contest: {
                            contest_name: tdoc.title,
                            start_time: Math.floor(tdoc.beginAt.getTime() / 1000),
                            end_time: Math.floor(tdoc.endAt.getTime() / 1000),
                            frozen_time: tdoc.lockAt ? Math.floor((tdoc.endAt.getTime() - tdoc.lockAt.getTime()) / 1000) : 0,
                            penalty: 1200,
                            problem_quantity: tdoc.pids.length,
                            problem_id: tdoc.pids.map((i, idx) => getAlphabeticId(idx)),
                            group: {
                                official: '正式队伍',
                                unofficial: '打星队伍',
                                ...Object.fromEntries(groups.filter((i) => relatedGroups.includes(i.name)).map((i) => [i.name, i.name])),
                            },
                            organization: 'School',
                            status_time_display: {
                                correct: true,
                                incorrect: true,
                                pending: true,
                            },
                            medal: {
                                official: {
                                    gold,
                                    silver,
                                    bronze,
                                },
                            },
                            balloon_color: tdoc.balloon
                                ? tdoc.pids.filter((i) => tdoc.balloon[i]).map((i) => ({
                                    color: '#000',
                                    background_color: typeof tdoc.balloon[i] === 'string' ? tdoc.balloon[i] : tdoc.balloon[i].color,
                                }))
                                : [],
                            logo: {
                                preset: 'ICPC',
                            },
                            // banner: {
                            //     url: 'assets/banner.png',
                            // },
                            options: {
                                submission_timestamp_unit: 'millisecond',
                            },
                        },
                        ...state,
                    };
                } else {
                    this.response.template = 'xcpcio_board.html';
                    let query = '';
                    if (gold || silver || bronze) query = `&gold=${gold}&silver=${silver}&bronze=${bronze}`;
                    if (realtime) query += '&realtime=true';
                    const endpoint = `/d/${tdoc.domainId}/contest/${tdoc.docId}/scoreboard/xcpcio`;
                    this.response.body = {
                        dataSource: `${endpoint}?json=true${query}#allInOne=true`,
                        js: indexJs,
                        css: indexCss,
                    };
                }
            },
            supportedRules: ['acm'],
        });
    });
}
