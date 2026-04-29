/* eslint-disable max-len */
import { LRUCache } from 'lru-cache';
import moment from 'moment';
import {
    _, avatar, ContestModel, ContestNotEndedError, Context, db, findFileSync,
    ForbiddenError, fs, Handler, InvalidTokenError, ObjectId, param, parseTimeMS, PERM, ProblemConfig, ProblemModel,
    randomstring, Schema, SettingModel, STATUS, STATUS_SHORT_TEXTS, STATUS_TEXTS,
    SystemModel, TokenModel, Types, UserModel, Zip,
} from 'hydrooj';

interface IpLoginInfo {
    _id: string;
    uid: number;
}

declare module 'hydrooj' {
    interface Collections {
        iplogin: IpLoginInfo;
    }
}
const coll = db.collection('iplogin');
const ipLoginCache = new LRUCache<string, IpLoginInfo>({ max: 1000, ttl: 60 * 1000 });

function normalizeIp(ip: string) {
    if (ip.startsWith('::ffff:')) return ip.slice(7);
    return ip;
}

const QuickImportSchema = Schema.array(Schema.object({
    id: Schema.union([Schema.string().required(), Schema.number().required()]),
    name: Schema.string().required(),
    password: Schema.string(),
    school: Schema.string(),
    members: Schema.array(Schema.string()).default([]),
    member1: Schema.string(),
    member2: Schema.string(),
    member3: Schema.string(),
    member4: Schema.string(),
    coach: Schema.string(),
    seat: Schema.string(),
    rank: Schema.boolean(),
    ip: Schema.string(),
}));

export const Config = Schema.object({
    ipLogin: Schema.boolean().default(false),
    extraFields: Schema.boolean().default(false),
    submit: Schema.boolean().default(false).description('Enable submit script'),
    contestMode: Schema.boolean().default(false).description('Enable contest mode'),
});

export function apply(ctx: Context, config: ReturnType<typeof Config>) {
    if (config.ipLogin) {
        ctx.on('handler/init', async (that) => {
            const iplogin = ipLoginCache.get(normalizeIp(that.request.ip)) || await coll.findOne({ _id: normalizeIp(that.request.ip) });
            if (!iplogin) {
                if (that.session.ipLoggedIn && that.session.ipLoggedIn !== normalizeIp(that.request.ip)) {
                    that.session.uid = 0;
                    that.session.user = await UserModel.getById(that.domain._id, 0);
                }
                return;
            }
            ipLoginCache.set(normalizeIp(that.request.ip), iplogin);
            that.user = await UserModel.getById(that.domain._id, iplogin.uid);
            if (!that.user) {
                that.user = await UserModel.getById(that.domain._id, 0);
                throw new ForbiddenError(`User ${iplogin.uid} not found`);
            }
            that.session.ipLoggedIn = that.request.ip;
            that.session.uid = iplogin.uid;
            that.session.user = that.user;
        });
    }

    const disable = (that) => {
        if (that.user.contestMode) throw new ForbiddenError('Not available');
    };
    ctx.on('handler/before/HomeDomain', disable);
    ctx.on('handler/before/DomainUser', disable);
    ctx.on('handler/before/HomeMessages#post', disable);
    ctx.on('handler/before/Files', disable);
    ctx.on('handler/before/HomeAvatar', disable);
    ctx.on('handler/before/HomeSecurity', disable);
    ctx.on('handler/before/UserDetail', disable);
    ctx.on('handler/before/UserLostPass', disable);
    ctx.on('handler/before/HomeSettings', (that) => {
        if (!that.user.contestMode) return;
        if (['domain', 'account'].includes(that.args.category)) throw new ForbiddenError('Not available');
    });

    async function generateCdpZip(tdoc) {
        let token = 0;
        const getFeed = (type: string, data: any) => ({
            type, id: data.id, data, token: `t${token++}`,
        });
        const [pdict, tsdocs] = await Promise.all([
            ProblemModel.getList(tdoc.domainId, tdoc.pids, true, false, ProblemModel.PROJECTION_LIST.concat('config'), true),
            ContestModel.getMultiStatus(tdoc.domainId, { docId: tdoc._id }).toArray(),
        ]);
        const udict = await UserModel.getList(tdoc.domainId, tsdocs.map((i) => i.uid));
        const teams = tsdocs.map((i) => {
            const udoc = udict[i.uid];
            return {
                team_id: udoc.seat || `team-${udoc._id}`,
                name: udoc.uname,
                displayName: (i.unrank ? '⭐' : '') + (udoc.displayName || udoc.uname),
                organization: udoc.school || udoc.uname,
                avatar: avatar(udoc.avatar),
                group: [
                    ...(udoc.group?.filter((g) => g !== `${udoc._id}`) || []),
                    i.unrank ? 'observers' : 'participants',
                ],
            };
        });
        const relatedGroups = Array.from(new Set(teams.flatMap((i) => i.group)));
        const groupId = {};
        let gid = 1;
        for (const i of relatedGroups) groupId[i] = `group-${gid++}`;
        const organizations = Array.from(new Set(teams.flatMap((i) => i.organization)));
        const orgId = {};
        let oid = 1;
        for (const i of organizations) orgId[i] = `org-${oid++}`;
        const duration = moment(tdoc.endAt).diff(tdoc.beginAt, 'seconds');
        const lockDuration = tdoc.lockAt
            ? moment(tdoc.endAt).diff(tdoc.lockAt, 'seconds')
            : tdoc.rule === 'oi' ? duration : null;
        const eventfeed: Record<string, any>[] = [
            getFeed('contest', {
                id: tdoc._id.toHexString(),
                name: tdoc.title,
                formal_name: tdoc.title,
                start_time: moment(tdoc.beginAt).format('YYYY-MM-DDTHH:mm:ss.SSS+08:00'),
                duration: moment().startOf('day').seconds(duration).format('HH:mm:ss.SSS'),
                ...lockDuration && {
                    scoreboard_freeze_duration: moment().startOf('day').seconds(lockDuration).format('HH:mm:ss.SSS'),
                },
                penalty_time: 20,
            }),
            ...Object.keys(STATUS_SHORT_TEXTS).map((i) => getFeed('judgement-types', {
                id: STATUS_SHORT_TEXTS[i],
                name: STATUS_TEXTS[i],
                penalty: ![STATUS.STATUS_ACCEPTED, STATUS.STATUS_COMPILE_ERROR, STATUS.STATUS_SYSTEM_ERROR].includes(+i),
                solved: +i === STATUS.STATUS_ACCEPTED,
            })),
            getFeed('languages', { id: 'c', name: 'C', entry_point_required: false, extensions: ['c'] }),
            getFeed('languages', { id: 'cpp', name: 'C++', entry_point_required: false, extensions: ['cpp', 'cc', 'cxx', 'c++'] }),
            getFeed('languages', { id: 'java', name: 'Java', entry_point_required: true, extensions: ['java'] }),
            getFeed('languages', { id: 'python3', name: 'Python 3', entry_point_required: false, entry_point_name: 'Main file', extensions: ['py', 'py3'] }),
            getFeed('languages', { id: 'kotlin', name: 'Kotlin', entry_point_required: true, extensions: ['kt'] }),
            getFeed('languages', { id: 'rust', name: 'Rust', entry_point_required: true, extensions: ['rs'] }),
            getFeed('languages', { id: 'go', name: 'Go', entry_point_required: true, extensions: ['go'] }),
            getFeed('groups', { id: 'participants', name: '正式队伍' }),
            getFeed('groups', { id: 'observers', name: '打星队伍' }),
            ...relatedGroups.map((i) => getFeed('groups', { id: groupId[i], name: i })),
            ...organizations.map((i) => getFeed('organizations', {
                id: orgId[i], name: i, formal_name: i,
                logo: [{ href: `contest/${tdoc._id}/organizations/${orgId[i]}/logo`, filename: 'logo.png', mime: 'image/png', width: 64, height: 64 }],
            })),
            ...teams.map((i) => getFeed('teams', {
                id: i.team_id, label: i.team_id, name: i.name,
                display_name: i.displayName || i.name,
                group_ids: i.group.map((j) => groupId[j]),
                organization_id: orgId[i.organization],
                photo: [{ href: `contest/${tdoc._id}/teams/${i.team_id}/photo`, filename: 'photo.png', mime: 'image/png', width: 1920, height: 1080 }],
                logo: [{ href: new URL(i.avatar, SystemModel.get('server.url')).toString(), filename: 'logo.webp', mime: 'image/webp', width: 128, height: 128 }],
            })),
            ...tdoc.pids.map((i, idx) => getFeed('problems', {
                id: `${i}`, label: String.fromCharCode(65 + idx), name: pdict[i].title, ordinal: idx,
                color: (typeof (tdoc.balloon?.[idx]) === 'object' ? tdoc.balloon[idx].name : tdoc.balloon?.[idx]) || 'white',
                rgb: (typeof (tdoc.balloon?.[idx]) === 'object' ? tdoc.balloon[idx].color : null) || '#ffffff',
                time_limit: Math.floor(parseTimeMS((pdict[i].config as ProblemConfig).timeMax) / 100) / 10,
                test_data_count: 20,
            })),
        ];
        let cntJudge = 0;
        const submissions = tsdocs.flatMap((i) => {
            if (!i.journal) return [];
            const journal = i.journal.filter((s) => tdoc.pids.includes(s.pid));
            const result: any[] = [];
            for (const s of journal) {
                const submitTime = moment(s.rid.getTimestamp());
                const submitDelta = submitTime.diff(tdoc.beginAt, 'seconds');
                const submitAt = moment().startOf('day').seconds(submitDelta).format('HH:mm:ss.SSS');
                const judgeTime = submitTime.add(1, 'seconds');
                const judgeDelta = judgeTime.diff(tdoc.beginAt, 'seconds');
                const judgeAt = moment().startOf('day').seconds(judgeDelta).format('HH:mm:ss.SSS');
                result.push(getFeed('submissions', {
                    id: s.rid, team_id: udict[i.uid]?.seat || `team-${i.uid}`,
                    problem_id: `${s.pid}`, language_id: s.lang?.split('.')[0] || 'cpp',
                    files: [], contest_time: submitAt,
                    time: submitTime.format('YYYY-MM-DDTHH:mm:ss.SSS+08:00'),
                }));
                result.push(getFeed('judgements', {
                    id: `${cntJudge}`, submission_id: s.rid,
                    judgement_type_id: STATUS_SHORT_TEXTS[s.status], max_run_time: 0.1,
                    start_contest_time: submitAt, end_contest_time: judgeAt,
                    start_time: submitTime.format('YYYY-MM-DDTHH:mm:ss.SSS+08:00'),
                    end_time: judgeTime.format('YYYY-MM-DDTHH:mm:ss.SSS+08:00'),
                    ...s.score != null && { score: s.score },
                }));
                cntJudge++;
            }
            return result;
        });
        const endState = [
            getFeed('state', {
                started: moment(tdoc.beginAt).format('YYYY-MM-DDTHH:mm:ss.SSS+08:00'),
                ended: moment(tdoc.endAt).format('YYYY-MM-DDTHH:mm:ss.SSS+08:00'),
                ...tdoc.lockAt && { frozen: moment(tdoc.lockAt).format('YYYY-MM-DDTHH:mm:ss.SSS+08:00') },
                finalized: moment().format('YYYY-MM-DDTHH:mm:ss.SSS+08:00'),
            }),
        ];
        const zip = new Zip.ZipWriter(new Zip.BlobWriter());
        await Promise.all([
            zip.add('event-feed.ndjson', new Zip.TextReader(eventfeed.concat(submissions).concat(endState).map((i) => JSON.stringify(i)).join('\n'))),
            zip.add('contest/logo.png', new Zip.BlobReader(new Blob([fs.readFileSync(findFileSync('@hydrooj/onsite-toolkit/public/logo.png'))]))),
            zip.add('teams/', null, { directory: true }),
            zip.add('organizations/', null, { directory: true }),
        ]);
        await Promise.all(teams.map(async (i) => {
            await zip.add(`teams/${i.team_id}/`, null, { directory: true });
            await zip.add(`teams/${i.team_id}/photo.url`, new Zip.TextReader(`URL=${i.avatar}`));
        }));
        await Promise.all(organizations.map(async (i) => {
            const avatarSrc = teams.find((j) => j.organization === i)?.avatar;
            if (!avatarSrc) return;
            await zip.add(`organizations/${orgId[i]}/`, null, { directory: true });
            await zip.add(`organizations/${orgId[i]}/photo.url`, new Zip.TextReader(`URL=${avatar(avatarSrc)}`));
        }));
        return zip.close();
    }

    class ContestResolverCdpHandler extends Handler {
        allowCors = true;
        @param('tid', Types.ObjectId)
        @param('token', Types.String)
        async get(domainId: string, tid: ObjectId, token: string) {
            const tokenDoc = await TokenModel.get(token, TokenModel.TYPE_EXPORT);
            if (!tokenDoc || tokenDoc.domainId !== domainId || tokenDoc.contestId?.toHexString() !== tid.toHexString()) {
                throw new InvalidTokenError(token);
            }
            const tdoc = await ContestModel.get(domainId, tid);
            if (!ContestModel.isDone(tdoc)) throw new ContestNotEndedError();
            this.response.addHeader('Access-Control-Allow-Origin', '*');
            this.binary(await generateCdpZip(tdoc), `contest-${tid}-cdp.zip`);
        }
    }

    ctx.Route('contest_resolver_cdp', '/contest/:tid/resolver-cdp/:token', ContestResolverCdpHandler);

    ctx.inject(['scoreboard'], ({ scoreboard }) => {
        scoreboard.addView('cdp', 'CDP', { tdoc: 'tdoc' }, {
            async display({ tdoc }) {
                if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
                if (!ContestModel.isDone(tdoc)) throw new ContestNotEndedError();
                this.binary(await generateCdpZip(tdoc), `contest-${tdoc._id}-cdp.zip`);
            },
            supportedRules: ['acm', 'oi'],
        });

        scoreboard.addView('resolver', 'Resolver', { tdoc: 'tdoc' }, {
            async display({ tdoc }) {
                if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
                if (!ContestModel.isDone(tdoc)) throw new ContestNotEndedError();
                const [tokenId] = await TokenModel.add(
                    TokenModel.TYPE_EXPORT, 600,
                    { domainId: tdoc.domainId, contestId: tdoc._id },
                );
                const source = new URL(`/d/${tdoc.domainId}/contest/${tdoc._id}/resolver-cdp/${tokenId}`, SystemModel.get('server.url')).toString();
                const target = new URL('https://resolver.hydrooj.com');
                target.searchParams.set('source', source);
                target.searchParams.set('mode', tdoc.rule === 'oi' ? 'oi' : 'acm');
                this.response.redirect = target.toString();
            },
            supportedRules: ['acm', 'oi'],
        });
    });

    /* eslint-disable no-await-in-loop */
    // @ts-ignore
    Hydro.model.system.onsiteImport = async function (filepath: string, tidsInput: string, format = 'webp') {
        const data = QuickImportSchema(JSON.parse(fs.readFileSync(filepath, 'utf-8')));
        const tids = tidsInput.split(',').map((i) => i.trim()).filter((i) => i).map((i) => new ObjectId(i));
        const tdocs = await Promise.all(tids.map((i) => ContestModel.get('system', i)));
        const convertUname = Types.Username[0];
        let cnt = 0;
        for (const line of data) {
            cnt++;
            const id = line.id || cnt;
            const uname = convertUname(line.name);
            const email = `${id}@onsite.local`;
            let team = await UserModel.getByEmail('system', email);
            if (!team) {
                const uid = await UserModel.create(email, uname, line.password || randomstring());
                team = await UserModel.getById('system', uid);
            } else {
                await UserModel.setUname(team._id, uname);
                if (line.password) await UserModel.setPassword(team._id, line.password);
            }
            if (line.member1) line.members.push(line.member1);
            if (line.member2) line.members.push(line.member2);
            if (line.member3) line.members.push(line.member3);
            if (line.member4) line.members.push(line.member4);
            const set: any = _.pick(line, 'school', 'members', 'coach', 'seat');
            if (line.school) set.avatar = `url:/avatars/${line.school.replace(/[ （）]/g, '')}.${format}`;
            set.contestMode = true;
            await UserModel.setById(team._id, set);
            for (const tdoc of tdocs) {
                const tsdoc = await ContestModel.getStatus('system', tdoc.docId, team._id);
                if (!tsdoc?.attend) await ContestModel.attend('system', tdoc.docId, team._id, 'rank' in line ? { unrank: !line.rank, subscribe: 1 } : { subscribe: 1 });
                else if ('rank' in line && tsdoc.unrank === line.rank) await ContestModel.setStatus('system', tdoc.docId, team._id, { unrank: !line.rank });
            }
            if (line.ip) await coll.updateOne({ _id: normalizeIp(line.ip) }, { $set: { uid: team._id } }, { upsert: true });
        }
    };

    // @ts-ignore
    Hydro.model.system.setIpLogin = async function (filepath: string) {
        const data = fs.readFileSync(filepath, 'utf-8').split('\n').filter((i) => i);
        for (const line of data) {
            const [seat, ip] = line.split(',').map((i) => i.trim());
            const user = await UserModel.coll.findOne({ seat });
            if (!user) {
                console.warn(`User ${seat} not found`);
                continue;
            }
            await coll.updateOne({ _id: normalizeIp(ip) }, { $set: { uid: user._id } }, { upsert: true });
        }
    };

    if (config.submit) ctx.plugin(require('./submit'));

    if (config.extraFields) {
        ctx.inject(['setting'], (c) => {
            c.setting.AccountSetting(
                SettingModel.Setting('setting_info', 'coach', null, 'text', 'coach', '', SettingModel.FLAG_DISABLED | SettingModel.FLAG_PUBLIC),
                SettingModel.Setting('setting_info', 'members', null, 'text', 'members', '', SettingModel.FLAG_DISABLED | SettingModel.FLAG_PUBLIC),
                SettingModel.Setting('setting_info', 'seat', null, 'text', 'seat', '', SettingModel.FLAG_DISABLED | SettingModel.FLAG_PUBLIC),
            );
        });
    }
    if (config.contestMode) {
        ctx.inject(['setting'], (c) => {
            c.setting.AccountSetting(
                SettingModel.Setting('setting_info', 'contestMode', null, 'boolean', 'contestMode', 'Contest Mode', SettingModel.FLAG_DISABLED | SettingModel.FLAG_PUBLIC),
            );
        });
    }
}
