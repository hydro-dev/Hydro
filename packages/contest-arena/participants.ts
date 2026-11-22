/* eslint-disable no-await-in-loop -- Validate every selected identity before consuming the import token. */
import { randomBytes, timingSafeEqual } from 'crypto';
import { readFileSync } from 'fs';
import ExcelJS from 'exceljs';
import {
    AdmZip,
    avatar,
    ContestModel as contest,
    Context,
    db,
    NotFoundError,
    ObjectId,
    PERM,
    PermissionError,
    PRIV,
    UserModel as user,
    ValidationError,
} from 'hydrooj';
import { ContestManagementBaseHandler } from 'hydrooj/src/handler/contest';
import {
    administrator,
    cancel,
    checkRuleChange,
    enable,
    enroll,
    ids,
    imports,
    refreshContestBindings,
    release,
} from './enrollment';
import { identityKey, modeWindow, ONSITE_RULE } from './mode-policy';

function csrf(handler: any) {
    handler.session.arenaManageCsrf ||= randomBytes(24).toString('hex');
    return handler.session.arenaManageCsrf;
}

export async function participantPage(handler: any) {
    const { tdoc } = handler;
    const tsdocs = await contest.getMultiStatus(tdoc.domainId, { docId: tdoc.docId, attend: 1 }).toArray();
    const uids = [...new Set(tsdocs.flatMap((s) => [s.uid, ...(s.members || [])]))];
    const udict = await user.getListForRender(
        tdoc.domainId,
        [tdoc.owner, ...uids],
        handler.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO),
    );
    const onsite = tdoc.rule === ONSITE_RULE;
    const onsiteEnded = onsite && contest.isDone(tdoc);
    const rows = await Promise.all(
        tsdocs.map(async (s) => {
            const udoc: any = udict[s.uid] || {};
            const members = s.members?.length ? s.members : [s.uid];
            const labels = members.map((uid) => udict[uid]?.class).filter(Boolean);
            const isAdmin = (await Promise.all(members.map((uid) => user.getById(tdoc.domainId, uid)))).every((u) =>
                administrator(u, tdoc),
            );
            const restricted = onsite && !onsiteEnded && s.arenaMode !== 'released' && !isAdmin;
            return {
                uid: s.uid,
                uname: udoc.uname || String(s.uid),
                name: s.displayName || udoc.name || udoc.displayName || udoc.uname || String(s.uid),
                className: [...new Set(labels)].join(' / ') || '未填写班级',
                avatar: avatar(udoc.avatar || '', 32),
                members: s.members?.length
                    ? s.members
                        .map((uid) => `${udict[uid]?.name || udict[uid]?.uname || uid} (${udict[uid]?.uname || uid})`)
                        .join('、')
                    : '',
                unrank: !!s.unrank,
                canResume:
                    s.endAt
                    && +s.endAt < +tdoc.endAt
                    && +tdoc.endAt > Date.now()
                    && (!tdoc.duration || !s.startAt || +s.startAt + tdoc.duration * 3600000 > Date.now()),
                restricted,
                canToggleMode: onsite && !onsiteEnded && !isAdmin,
                modeLabel: !onsite
                    ? ''
                    : onsiteEnded
                        ? '已自动解除'
                        : isAdmin
                            ? '管理员不受限'
                            : restricted
                                ? modeWindow(tdoc).active
                                    ? '参赛模式中'
                                    : '开赛前 20 分钟生效'
                                : '已解除',
            };
        }),
    );
    handler.response.body = {
        tdoc,
        udict,
        rows,
        onsite,
        onsiteEnded,
        hasResumable: rows.some((row) => row.canResume),
        csrf: csrf(handler),
        participantApi: handler.url('arena_participants_api', { tid: tdoc.docId }),
        participantTemplate: handler.url('arena_participants_api', { tid: tdoc.docId, query: { template: '1' } }),
        participantJs: handler.url('arena_asset', { version: handler.args.arenaAssetVersion, file: 'participants.js' }),
        participantCss: handler.url('arena_asset', { version: handler.args.arenaAssetVersion, file: 'participants.css' }),
        page_name: 'contest_user',
    };
    handler.response.template = 'arena_participants.html';
    handler.response.pjax = null;
}

function scalar(cell: ExcelJS.Cell) {
    const value = cell.value;
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
    if (typeof value === 'object' && 'richText' in value) {
        return value.richText
            .map((part) => part.text)
            .join('')
            .trim();
    }
    throw new Error('班级和姓名请填写文本或粘贴为值');
}

async function readRoster(buffer: Buffer) {
    if (!buffer.length || buffer.length > 4 * 1024 * 1024) throw new ValidationError('Excel 文件不能超过 4 MiB');
    try {
        const entries = new AdmZip(buffer).getEntries();
        if (entries.length > 5000 || entries.reduce((sum, entry) => sum + entry.header.size, 0) > 32 * 1024 * 1024) { throw new Error(); }
    } catch {
        throw new ValidationError('Excel 文件无效或内容过大，请使用模板重新保存为 .xlsx');
    }
    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.load(buffer as any);
    } catch {
        throw new ValidationError('无法读取 Excel，请保存为 .xlsx 格式');
    }
    const sheet = workbook.worksheets[0];
    let validHeader = false;
    try {
        validHeader = !!sheet && scalar(sheet.getCell('A1')) === '班级' && scalar(sheet.getCell('B1')) === '姓名';
    } catch {
        /* Invalid header cells are reported below. */
    }
    if (!validHeader) throw new ValidationError('第一行 A1 应为“班级”，B1 应为“姓名”');
    if (sheet.rowCount > 5001) throw new ValidationError('一次最多导入 5000 行');
    const rows: any[] = [];
    const issues: any[] = [];
    for (let line = 2; line <= sheet.rowCount; line++) {
        try {
            const className = scalar(sheet.getCell(line, 1));
            const name = scalar(sheet.getCell(line, 2));
            if (!className && !name) continue;
            if (!className || !name || className.length > 100 || name.length > 100) throw new Error('班级或姓名为空/过长');
            rows.push({ line, className, name });
        } catch (error) {
            issues.push({ line, reason: error.message });
        }
    }
    return { rows, issues };
}

export class ArenaParticipantsHandler extends ContestManagementBaseHandler {
    async __prepare() {
        const tid = this.request.params.tid;
        if (!ObjectId.isValid(tid)) throw new NotFoundError('比赛');
        this.args.domainId = this.domain._id;
        this.args.tid = new ObjectId(tid);
        await super.__prepare(this.domain._id, this.args.tid);
    }

    async prepare() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        await super.prepare();
        this.response.addHeader('Cache-Control', 'private, no-store');
        if (this.request.method.toLowerCase() === 'post') {
            const got = Buffer.from(String(this.request.body.csrf || ''));
            const want = Buffer.from(csrf(this));
            if (got.length !== want.length || !timingSafeEqual(got, want)) { throw new ValidationError('页面已过期，请刷新后重试'); }
        }
    }

    async get() {
        if (this.request.query.template === '1') {
            const workbook = new ExcelJS.Workbook();
            workbook.addWorksheet('参赛者').addRow(['班级', '姓名']);
            this.response.type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            this.response.disposition = `attachment; filename="participants-template.xlsx"; filename*=UTF-8''${encodeURIComponent('参赛者导入模板.xlsx')}`;
            this.response.body = Buffer.from(await workbook.xlsx.writeBuffer());
            return;
        }
        const query = String(this.request.query.q || '').trim();
        if (query.length < 1 || query.length > 100) {
            this.response.body = { users: [] };
            return;
        }
        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const students = await db
            .collection<any>('stu.info')
            .find({ $or: [{ name: regex }, { class: regex }] })
            .limit(150)
            .toArray();
        const accounts = await user.coll
            .find({ $or: [{ uname: regex }, ...(Number.isSafeInteger(+query) ? [{ _id: +query }] : [])] })
            .project({ _id: 1 })
            .limit(50)
            .toArray();
        const candidates = [...new Set([...students.map((s) => s._id), ...accounts.map((s) => s._id)])].slice(0, 100);
        const dictionary = await user.getListForRender(this.domain._id, candidates, false);
        const enrolled = new Set(
            (
                await contest
                    .getMultiStatus(this.domain._id, { docId: this.tdoc.docId, uid: { $in: candidates }, attend: 1 })
                    .toArray()
            ).map((s) => s.uid),
        );
        this.response.body = {
            users: candidates
                .filter((uid) => dictionary[uid])
                .map((uid) => ({
                    uid,
                    uname: dictionary[uid].uname,
                    name: dictionary[uid].name || dictionary[uid].displayName || dictionary[uid].uname,
                    className: dictionary[uid].class || '未填写班级',
                    enrolled: enrolled.has(uid),
                })),
        };
    }

    async post() {
        const body = this.request.body;
        const action = String(body.action || '');
        const tdoc = this.tdoc;
        if (action === 'add') {
            this.response.body = await enroll(
                tdoc,
                ids(body.uids),
                this.user._id,
                body.unrank === true || body.unrank === 'true',
            );
        } else if (action === 'release') this.response.body = await release(tdoc, ids(body.uids), this.user._id);
        else if (action === 'enable') this.response.body = await enable(tdoc, ids(body.uids), this.user._id);
        else if (action === 'cancel') this.response.body = await cancel(tdoc, ids(body.uids), this.user._id);
        else if (action === 'resume') {
            const uid = ids(body.uids)[0];
            const status = await contest.getStatus(this.domain._id, tdoc.docId, uid);
            if (
                !status?.attend
                || +tdoc.endAt <= Date.now()
                || (tdoc.duration && status.startAt && +status.startAt + tdoc.duration * 3600000 <= Date.now())
            ) { throw new ValidationError('当前不能恢复比赛'); }
            await contest.setStatus(this.domain._id, tdoc.docId, uid, null, { endAt: '' });
            this.response.body = { changed: [uid] };
        } else if (action === 'rank') {
            const uid = ids(body.uids)[0];
            const status = await contest.getStatus(this.domain._id, tdoc.docId, uid);
            if (!status?.attend) throw new ValidationError('该用户尚未报名');
            await contest.setStatus(this.domain._id, tdoc.docId, uid, { unrank: !status.unrank });
            this.response.body = { changed: [uid] };
        } else if (action === 'import') await this.importRoster();
        else if (action === 'resolve') await this.resolveImport();
        else throw new ValidationError('操作');
    }

    async importRoster() {
        const file = this.request.files?.file;
        if (!file || Array.isArray(file) || !/\.xlsx$/i.test(file.originalFilename || '')) { throw new ValidationError('请选择 .xlsx 文件'); }
        if (file.size > 4 * 1024 * 1024) throw new ValidationError('Excel 文件不能超过 4 MiB');
        const { rows, issues } = await readRoster(readFileSync(file.filepath));
        const keys = new Map<string, any>();
        for (const row of rows) {
            const key = identityKey(row.className, row.name);
            if (keys.has(key)) keys.get(key).lines.push(row.line);
            else keys.set(key, { ...row, lines: [row.line] });
        }
        const pairs = [...keys.values()];
        const students = pairs.length
            ? await db
                .collection<any>('stu.info')
                .find({ $or: pairs.map((r) => ({ class: r.className, name: r.name })) })
                .toArray()
            : [];
        const candidates = await user.getListForRender(
            this.domain._id,
            students.map((s) => s._id),
            false,
        );
        const byKey = new Map<string, number[]>();
        for (const student of students) {
            if (candidates[student._id]) {
                const key = identityKey(student.class, student.name);
                byKey.set(key, [...(byKey.get(key) || []), student._id]);
            }
        }
        const unique: number[] = [];
        const duplicates: any[] = [];
        const unmatched: any[] = [];
        for (const row of pairs) {
            const matches = byKey.get(identityKey(row.className, row.name)) || [];
            if (!matches.length) unmatched.push({ ...row, reason: '未找到班级和姓名完全一致的 OJ 账号' });
            else if (matches.length === 1) unique.push(matches[0]);
            else {
                duplicates.push({
                    key: String(duplicates.length),
                    className: row.className,
                    name: row.name,
                    lines: row.lines,
                    candidates: matches.map((uid) => ({
                        uid,
                        uname: candidates[uid].uname,
                        name: row.name,
                        className: row.className,
                    })),
                });
            }
        }
        const imported = unique.length
            ? await enroll(this.tdoc, [...new Set(unique)], this.user._id)
            : { added: [], existing: [], failed: [] };
        let token = '';
        if (duplicates.length) {
            token = randomBytes(24).toString('hex');
            await imports.insertOne({
                _id: token,
                domainId: this.domain._id,
                contest: this.tdoc.docId,
                actor: this.user._id,
                sessionCsrf: csrf(this),
                groups: duplicates,
                expiresAt: new Date(Date.now() + 20 * 60 * 1000),
            });
        }
        this.response.body = {
            ...imported,
            rows: rows.length,
            repeatedRows: rows.length - pairs.length,
            unmatched,
            issues,
            duplicates,
            token,
        };
    }

    async resolveImport() {
        const token = String(this.request.body.token || '');
        const choices = this.request.body.choices;
        const query = {
            _id: token,
            domainId: this.domain._id,
            contest: this.tdoc.docId,
            actor: this.user._id,
            sessionCsrf: csrf(this),
            expiresAt: { $gt: new Date() },
        };
        const pending = await imports.findOne(query);
        if (!pending || !choices || typeof choices !== 'object' || Array.isArray(choices)) { throw new ValidationError('导入选择已过期，请重新上传表格'); }
        const chosen: number[] = [];
        for (const [key, selection] of Object.entries(choices)) {
            const group = pending.groups.find((g) => g.key === key);
            if (!group || !Array.isArray(selection)) throw new ValidationError('重名选择无效');
            for (const uid of selection) {
                if (!Number.isSafeInteger(uid) || !group.candidates.some((c) => c.uid === uid)) { throw new ValidationError('所选账号不属于该同班同名组'); }
                if (!(await db.collection<any>('stu.info').findOne({ _id: uid, class: group.className, name: group.name }))) {
                    throw new ValidationError('所选账号的班级或姓名已改变，请重新上传');
                }
                chosen.push(uid);
            }
        }
        if (!(await imports.findOneAndDelete(query))) throw new ValidationError('这次导入已经处理，请刷新');
        this.response.body = chosen.length
            ? await enroll(this.tdoc, [...new Set(chosen)], this.user._id)
            : { added: [], existing: [], failed: [] };
    }
}

export function installParticipantManagement(ctx: Context, assetVersion: string) {
    ctx.on('contest/before-edit', checkRuleChange);
    ctx.on('contest/edit', refreshContestBindings);
    ctx.Route('arena_participants_api', '/contest/:tid/participants-api', ArenaParticipantsHandler, PERM.PERM_VIEW_CONTEST);
    ctx.on('handler/after/ContestUser#get', async (handler) => {
        handler.args.arenaAssetVersion = assetVersion;
        await participantPage(handler);
    });
    ctx.on('handler/before-operation/ContestUser', async (handler) => {
        if (handler.args.operation === 'remove_user') {
            handler.response.body = await cancel(handler.tdoc, ids([handler.request.body.uid]), handler.user._id);
            return 'cleanup';
        }
        if (handler.args.operation !== 'add_user') return undefined;
        handler.response.body = await enroll(
            handler.tdoc,
            ids(handler.request.body.uids),
            handler.user._id,
            handler.request.body.unrank === true || ['true', 'on', '1'].includes(handler.request.body.unrank),
        );
        return 'cleanup';
    });
    ctx.on('handler/before-operation/ContestDetail', async (handler) => {
        if (
            handler.tdoc.rule === ONSITE_RULE
            && handler.args.operation === 'attend'
            && !administrator(handler.user, handler.tdoc)
        ) { throw new PermissionError(PERM.PERM_EDIT_CONTEST); }
    });
}
