/* eslint-disable no-await-in-loop -- Registration, duplicate checks and bindings must be updated in order. */
import { ContestModel as contest, db, NotFoundError, PERM, PRIV, UserModel as user, ValidationError } from 'hydrooj';
import { canReuseTeamRoster, modeWindow, ONSITE_RULE } from './mode-policy';

export const modes = db.collection<any>('contest.arena.mode');
export const imports = db.collection<any>('contest.arena.import');
const statuses = db.collection<any>('document.status');
const statusQuery = (tdoc: any, uid: number) => ({ domainId: tdoc.domainId, docType: 30, docId: tdoc.docId, uid });

export function administrator(udoc: any, tdoc: any) {
    return (
        udoc
        && (udoc.hasPriv(PRIV.PRIV_EDIT_SYSTEM)
            || udoc.hasPriv(PRIV.PRIV_MANAGE_ALL_DOMAIN)
            || udoc.own(tdoc)
            || udoc.hasPerm(PERM.PERM_EDIT_CONTEST))
    );
}

async function eligibleMember(tdoc: any, uid: number) {
    const udoc = await user.getById(tdoc.domainId, uid);
    if (!udoc?.hasPriv(PRIV.PRIV_USER_PROFILE)) throw new ValidationError(`账号 ${uid} 不可参赛`);
    if (administrator(udoc, tdoc)) return udoc;
    if (!udoc.hasPerm(PERM.PERM_VIEW_CONTEST)) { throw new ValidationError(`账号 ${udoc.uname} 无域内比赛访问权限，请先完成加域或调整权限`); }
    if (tdoc.assign?.length && !udoc.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST)) {
        const groups = new Set((await user.listGroup(tdoc.domainId, uid)).map((g) => g.name));
        if (!tdoc.assign.some((g) => groups.has(g))) { throw new ValidationError(`账号 ${udoc.uname} 不在本比赛的指定用户或组中，请先调整比赛的参赛范围`); }
    }
    return udoc;
}

async function resolveBinding(uid: number, binding: any) {
    let tdoc;
    try {
        tdoc = await contest.get(binding.domainId, binding.contest);
    } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
    }
    if (
        tdoc.rule !== ONSITE_RULE
        || !Number.isFinite(+tdoc.endAt)
        || +tdoc.endAt <= Date.now()
        || (binding.participantUid < 0 && !tdoc.allowTeam)
    ) { return null; }
    const [udoc, status] = await Promise.all([
        user.getById(binding.domainId, uid),
        contest.getStatus(binding.domainId, binding.contest, binding.participantUid),
    ]);
    if (
        !status?.attend
        || status.registrationCancelled
        || status.arenaMode === 'released'
        || administrator(udoc, tdoc)
        || (binding.participantUid !== uid && !status.members?.includes(uid))
    ) { return null; }
    return {
        binding,
        tdoc,
        ...modeWindow(tdoc),
        redirect: `/d/${encodeURIComponent(binding.domainId)}/contest/${tdoc.docId}/arena`,
    };
}

export async function modeFor(uid: number) {
    if (!uid || uid < 0) return null;
    const binding = await modes.findOne({ _id: uid });
    if (binding) {
        const current = await resolveBinding(uid, binding);
        if (current) return current;
        // An enrollment in progress owns its reservation until it commits or expires.
        if (binding.pendingUntil > new Date()) return null;
        await modes.deleteOne({
            _id: uid,
            contest: binding.contest,
            domainId: binding.domainId,
            participantUid: binding.participantUid,
        });
    }
    // Rule conversions and pre-existing registrations may not have a materialized binding yet.
    // Resolve from the authoritative registration instead of silently letting the account escape.
    const entries = await statuses
        .find({
            docType: 30,
            attend: 1,
            registrationCancelled: { $ne: true },
            arenaMode: { $ne: 'released' },
            $or: [{ uid }, { members: uid }],
        })
        .sort({ docId: -1 })
        .toArray();
    for (const status of entries) {
        const candidate = { _id: uid, domainId: status.domainId, contest: status.docId, participantUid: status.uid };
        const current = await resolveBinding(uid, candidate);
        if (!current) continue;
        try {
            await modes.insertOne({ ...candidate, assignedAt: new Date(), recovered: true });
        } catch (error) {
            if (error?.code !== 11000) throw error;
            const concurrent = await modes.findOne({ _id: uid });
            return concurrent ? await resolveBinding(uid, concurrent) : null;
        }
        return current;
    }
    return null;
}

export async function checkRuleChange(tdoc: any, updates: any) {
    if (updates.rule !== ONSITE_RULE || tdoc.rule === ONSITE_RULE) return;
    const converted = { ...tdoc, ...updates };
    const entries = await contest.getMultiStatus(tdoc.domainId, { docId: tdoc.docId, attend: 1 }).toArray();
    const participants = new Map<number, number>();
    for (const entry of entries) {
        for (const uid of entry.members?.length ? entry.members : [entry.uid]) {
            if (participants.has(uid) && participants.get(uid) !== entry.uid) { throw new ValidationError(`账号 ${uid} 在本比赛中重复报名，请先取消重复报名`); }
            participants.set(uid, entry.uid);
        }
    }
    for (const entry of entries) {
        if (entry.arenaMode === 'released') continue;
        if (entry.uid < 0 && !converted.allowTeam) throw new ValidationError('已有队伍报名，请先开启队伍参赛');
        if (contest.isDone(converted)) continue;
        for (const uid of entry.members?.length ? entry.members : [entry.uid]) {
            const udoc = await eligibleMember(converted, uid);
            if (administrator(udoc, converted)) continue;
            const current = await modeFor(uid);
            const reserved = await modes.findOne({ _id: uid });
            const other = current?.binding || (reserved?.pendingUntil > new Date() ? reserved : null);
            if (
                other
                && (other.domainId !== tdoc.domainId || !other.contest.equals(tdoc.docId) || other.participantUid !== entry.uid)
            ) { throw new ValidationError(`账号 ${udoc?.uname || uid} 已在另一场现场赛或另一支队伍中，请先解除`); }
        }
    }
}

export async function refreshContestBindings(tdoc: any) {
    if (tdoc.rule !== ONSITE_RULE || contest.isDone(tdoc)) {
        await modes.deleteMany({ domainId: tdoc.domainId, contest: tdoc.docId });
        return;
    }
    const entries = await contest
        .getMultiStatus(tdoc.domainId, { docId: tdoc.docId, attend: 1, arenaMode: { $ne: 'released' } })
        .toArray();
    for (const entry of entries) for (const uid of entry.members?.length ? entry.members : [entry.uid]) await modeFor(uid);
}

async function bind(tdoc: any, participantUid: number, members: number[], actor: number) {
    if (participantUid < 0 && !tdoc.allowTeam) throw new ValidationError('该比赛未开启队伍参赛');
    const duplicates = await contest
        .getMultiStatus(tdoc.domainId, {
            docId: tdoc.docId,
            attend: 1,
            uid: { $ne: participantUid },
            $or: [{ uid: { $in: members } }, { members: { $in: members } }],
        })
        .limit(1)
        .next();
    if (duplicates) { throw new ValidationError('该账号已作为另一名参赛者或其他队伍报名，请先取消重复报名；解除参赛模式不会取消报名'); }
    const created: number[] = [];
    try {
        for (const uid of members) {
            const udoc = await eligibleMember(tdoc, uid);
            if (administrator(udoc, tdoc) || contest.isDone(tdoc)) continue;
            await modeFor(uid);
            let old = await modes.findOne({ _id: uid });
            if (old && (old.domainId !== tdoc.domainId || !old.contest.equals(tdoc.docId))) {
                const valid = await modeFor(uid);
                if (valid || old.pendingUntil > new Date()) { throw new ValidationError(`账号 ${udoc.uname} 已在另一场现场赛的参赛模式中，请先解除`); }
                await modes.deleteOne({ _id: uid, contest: old.contest, domainId: old.domainId });
                old = null;
            }
            if (old && old.participantUid !== participantUid) { throw new ValidationError(`账号 ${udoc.uname} 已作为其他参赛者报名`); }
            if (!old) {
                try {
                    await modes.insertOne({
                        _id: uid,
                        domainId: tdoc.domainId,
                        contest: tdoc.docId,
                        participantUid,
                        assignedBy: actor,
                        assignedAt: new Date(),
                        pendingUntil: new Date(Date.now() + 60000),
                    });
                    created.push(uid);
                } catch (error) {
                    if (error?.code !== 11000) throw error;
                    const concurrent = await modes.findOne({ _id: uid });
                    if (
                        concurrent?.domainId !== tdoc.domainId
                        || !concurrent?.contest.equals(tdoc.docId)
                        || concurrent.participantUid !== participantUid
                    ) { throw new ValidationError(`账号 ${udoc.uname} 正在被另一场比赛添加`); }
                }
            }
        }
        return created;
    } catch (error) {
        if (created.length) await modes.deleteMany({ _id: { $in: created }, contest: tdoc.docId, domainId: tdoc.domainId });
        throw error;
    }
}

export function ids(value: unknown) {
    const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',').filter(Boolean) : [];
    const result = [...new Set(raw.map(Number))];
    if (!result.length || result.length > 5000 || result.some((uid) => !Number.isSafeInteger(uid) || !uid)) { throw new ValidationError('请选择有效参赛者'); }
    return result;
}

export async function enroll(tdoc: any, uids: number[], actor: number, unrank = false) {
    const result = { added: [] as number[], existing: [] as number[], failed: [] as { uid: number, reason: string }[] };
    for (const uid of uids) {
        let created: number[] = [];
        try {
            const old = await contest.getStatus(tdoc.domainId, tdoc.docId, uid);
            if (old?.attend && !old.registrationCancelled) {
                result.existing.push(uid);
                continue;
            }
            const virtual = uid < 0 ? await user.getVuserById(uid) : null;
            if (uid < 0 && !tdoc.allowTeam) throw new ValidationError('该比赛未开启队伍参赛');
            const members = virtual?.members?.length ? [...new Set<number>(virtual.members)] : [uid];
            if (uid < 0 && !virtual?.members?.length) throw new ValidationError('队伍没有有效成员');
            let previousRoster = old;
            const changedRoster = old && (!old.members?.length || old.members.length !== members.length
                || old.members.some((member) => !members.includes(member)));
            if (uid < 0 && tdoc.rule === ONSITE_RULE && changedRoster && !old.journal?.length) {
                const clarifications = await contest.getMultiClarification(tdoc.domainId, tdoc.docId);
                previousRoster = { ...old, hasClarifications: clarifications.some((item) => item.owner > 0
                    && (item.arenaParticipant === uid || (item.arenaParticipant === undefined && old.members?.includes(item.owner)))) };
            }
            if (uid < 0 && tdoc.rule === ONSITE_RULE && !canReuseTeamRoster(previousRoster, members)) {
                throw new ValidationError('该队伍已有提交或答疑，不能更换成员后沿用原报名；请新建队伍参赛，原数据会保留');
            }
            for (const member of members) {
                if (!(await user.getById(tdoc.domainId, member))?.hasPriv(PRIV.PRIV_USER_PROFILE)) { throw new ValidationError('用户不存在或不可参赛'); }
            }
            if (tdoc.rule === ONSITE_RULE) created = await bind(tdoc, uid, members, actor);
            try {
                await contest.attend(tdoc.domainId, tdoc.docId, uid, {
                    unrank,
                    registrationCancelled: false,
                    arenaMode: 'active',
                    ...(virtual ? { members, displayName: virtual.displayName || virtual.uname } : {}),
                });
            } catch (error) {
                if (!(await contest.getStatus(tdoc.domainId, tdoc.docId, uid))?.attend) throw error;
            }
            await modes.updateMany(
                { domainId: tdoc.domainId, contest: tdoc.docId, participantUid: uid },
                { $unset: { pendingUntil: '' } },
            );
            result.added.push(uid);
        } catch (error) {
            if (created.length) { await modes.deleteMany({ _id: { $in: created }, contest: tdoc.docId, domainId: tdoc.domainId }); }
            result.failed.push({ uid, reason: error.message });
        }
    }
    return result;
}

export async function release(tdoc: any, uids: number[], actor: number) {
    if (tdoc.rule !== ONSITE_RULE) throw new ValidationError('只有现场赛使用参赛模式');
    const result = { changed: [] as number[], failed: [] as any[] };
    for (const uid of uids) {
        const status = await contest.getStatus(tdoc.domainId, tdoc.docId, uid);
        if (!status?.attend) {
            result.failed.push({ uid, reason: '尚未报名' });
            continue;
        }
        await contest.setStatus(tdoc.domainId, tdoc.docId, uid, {
            arenaMode: 'released',
            arenaReleasedAt: new Date(),
            arenaReleasedBy: actor,
        });
        await modes.deleteMany({ domainId: tdoc.domainId, contest: tdoc.docId, participantUid: uid });
        result.changed.push(uid);
    }
    return result;
}

export async function enable(tdoc: any, uids: number[], actor: number) {
    if (tdoc.rule !== ONSITE_RULE) throw new ValidationError('只有现场赛使用参赛模式');
    if (contest.isDone(tdoc)) throw new ValidationError('比赛已结束，参赛模式已自动解除');
    const result = { changed: [] as number[], failed: [] as any[] };
    for (const uid of uids) {
        try {
            const status = await contest.getStatus(tdoc.domainId, tdoc.docId, uid);
            if (!status?.attend || status.registrationCancelled) throw new ValidationError('尚未报名');
            await bind(tdoc, uid, status.members?.length ? status.members : [uid], actor);
            await contest.setStatus(tdoc.domainId, tdoc.docId, uid, { arenaMode: 'active' });
            await modes.updateMany(
                { domainId: tdoc.domainId, contest: tdoc.docId, participantUid: uid },
                { $unset: { pendingUntil: '' } },
            );
            result.changed.push(uid);
        } catch (error) {
            result.failed.push({ uid, reason: error.message });
        }
    }
    return result;
}

export async function cancel(tdoc: any, uids: number[], actor: number) {
    const result = { changed: [] as number[], failed: [] as any[] };
    for (const uid of uids) {
        const changed = await statuses.findOneAndUpdate(
            { ...statusQuery(tdoc, uid), attend: 1 },
            {
                $set: {
                    attend: 0,
                    registrationCancelled: true,
                    arenaMode: 'released',
                    registrationCancelledAt: new Date(),
                    registrationCancelledBy: actor,
                },
            },
        );
        if (!changed) {
            result.failed.push({ uid, reason: '尚未报名或已取消' });
            continue;
        }
        await db
            .collection<any>('document')
            .updateOne({ domainId: tdoc.domainId, docType: 30, docId: tdoc.docId }, { $inc: { attend: -1 } });
        await modes.deleteMany({ domainId: tdoc.domainId, contest: tdoc.docId, participantUid: uid });
        result.changed.push(uid);
    }
    return result;
}
