/* eslint-disable no-await-in-loop */
import path from 'path';
import mariadb from 'mariadb';
import TurndownService from 'turndown';
import {
    _, buildContent, ContestModel, DiscussionModel, DocumentModel, DomainModel, fs, moment, noop, NotFoundError, ObjectId, postJudge, ProblemModel,
    RecordDoc, RecordModel, SolutionModel, STATUS, StorageModel, SystemModel, Time, UserModel,
} from 'hydrooj';

const turndown = new TurndownService({
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
});

function parsePhpArray(serialized: string) {
    const initial = serialized;
    const readString = (length: number) => {
        const buf = new TextEncoder().encode(serialized).slice(0, length);
        const result = new TextDecoder().decode(buf);
        serialized = serialized.slice(result.length);
        return result;
    };
    const readInt = () => {
        let val = 0;
        if (!'0123456789'.includes(serialized[0])) throw new Error(`Expected number, got "${serialized[0]}", initial "${initial}"`);
        while ('0123456789'.includes(serialized[0])) {
            val = val * 10 + +serialized[0];
            serialized = serialized.slice(1);
        }
        return val;
    };
    const readToken = (token: string) => {
        if (serialized.startsWith(token)) serialized = serialized.slice(token.length);
        else throw new Error(`Expected token "${token}", got "${serialized.slice(0, token.length)}", initial "${initial}"`);
    };
    readToken('a:');
    const size = readInt();
    readToken(':{');
    const result = [...Array.from({ length: size }, () => '')];
    for (let i = 0; i < size; i++) {
        readToken('i:');
        const key = readInt();
        readToken(';s:');
        const length = readInt();
        readToken(':"');
        const value = readString(length);
        result[key] = value;
        readToken('";');
    }
    return result;
}

async function addContestFile(domainId: string, tid: ObjectId, filename: string, filepath: string) {
    const tdoc = await ContestModel.get(domainId, tid);
    await StorageModel.put(`contest/${domainId}/${tid}/${filename}`, filepath, 1);
    const meta = await StorageModel.getMeta(`contest/${domainId}/${tid}/${filename}`);
    const payload = { _id: filename, name: filename, ..._.pick(meta, ['size', 'lastModified', 'etag']) };
    if (!meta) return false;
    await ContestModel.edit(domainId, tid, { files: [...(tdoc.files || []), payload] });
    return true;
}

function fixFileName(fileName: string) {
    if (fileName.endsWith('.in') || fileName.endsWith('.out')) {
        const dotAt = fileName.lastIndexOf('.');
        const name = fileName.slice(0, dotAt);
        const suffix = fileName.slice(dotAt + 1);
        if (!name.match(/[0-9]/)) {
            fileName = `${name}0.${suffix}`;
        }
    }
    return fileName.replace(/[\\/?#~!|*]/g, '_');
}

async function iterate(
    count: bigint | number, step: bigint | number, cb: (pageId: bigint) => Promise<void>,
    reportOpts?: { every: number | bigint, namespace: string, report: (data: any) => void },
) {
    const _count = BigInt(count);
    const _step = BigInt(step);
    const { every, namespace, report } = reportOpts || {};
    const _showProgress = every ? BigInt(every) : 0n;
    const pageCount = _count / _step + (_count % _step === 0n ? 0n : 1n);
    for (let pageId = 0n; pageId < pageCount; pageId++) {
        await cb(pageId);
        if (reportOpts && pageId % _showProgress === 0n) {
            const progress = pageId * _step * 100n / _count;
            report({
                message: `${namespace} finished ${Number(pageId * _step)} / ${Number(count)} (${Number(progress)}%)`,
            });
        }
    }
}

export async function run({
    host = 'localhost', port = 3306, name = 'jnoj',
    username, password, domainId, dataDir = '/www/jnoj/jnoj/judge/data/',
    uploadDir = '/www/jnoj/jnoj/web/uploads/', rerun = true, randomMail = false,
    withContest = true, keepGroups = '', hideExtraGroup = false,
}, report: (data: any) => void) {
    const _keepGroups = keepGroups.split(',').map((i) => i.trim());
    const src = await mariadb.createConnection({
        host,
        port,
        user: username,
        password,
        database: name,
    });
    const query = (q: string) => new Promise<any[]>((res, rej) => {
        src.query(q).then((r) => res(r)).catch((e) => rej(e));
    });
    report({ message: JSON.stringify(await query("show VARIABLES like 'char%';")) });
    const target = await DomainModel.get(domainId);
    if (!target) throw new NotFoundError(domainId);
    report({ message: 'Connected to database' });
    // await SystemModel.set('migrate.lock', 'jnoj');
    /*  User
        +----------------------+--------------+------+-----+---------+----------------+
        | Field                | Type         | Null | Key | Default | Extra          |
        +----------------------+--------------+------+-----+---------+----------------+
        | id                   | int          | NO   | PRI | NULL    | auto_increment |
        | username             | varchar(64)  | NO   | UNI | NULL    |                |
        | nickname             | varchar(64)  | NO   |     | NULL    |                |
        | auth_key             | varchar(32)  | NO   |     | NULL    |                |
        | password_hash        | varchar(128) | NO   |     | NULL    |                |
        | password_reset_token | varchar(255) | YES  |     | NULL    |                |
        | email                | varchar(255) | NO   | UNI | NULL    |                |
        | status               | smallint     | NO   |     | 10      |                |
        | role                 | smallint     | NO   |     | 10      |                |
        | language             | smallint     | NO   |     | 1       |                |
        | created_at           | datetime     | NO   |     | NULL    |                |
        | updated_at           | datetime     | YES  |     | NULL    |                |
        | rating               | int          | YES  |     | NULL    |                |
        | is_verify_email      | smallint     | NO   |     | 0       |                |
        | verification_token   | varchar(255) | NO   |     |         |                |
        +----------------------+--------------+------+-----+---------+----------------+
        User Profile
        +----------------+--------------+------+-----+---------+-------+
        | Field          | Type         | Null | Key | Default | Extra |
        +----------------+--------------+------+-----+---------+-------+
        | user_id        | int          | NO   | PRI | NULL    |       |
        | gender         | smallint     | YES  |     | 0       |       |
        | qq_number      | bigint       | YES  |     | NULL    |       |
        | birthdate      | date         | YES  |     | NULL    |       |
        | signature      | varchar(255) | YES  |     | NULL    |       |
        | address        | varchar(255) | YES  |     | NULL    |       |
        | description    | varchar(255) | YES  |     | NULL    |       |
        | school         | varchar(255) | YES  |     | NULL    |       |
        | student_number | varchar(64)  | YES  |     | NULL    |       |
        | major          | varchar(64)  | YES  |     | NULL    |       |
        +----------------+--------------+------+-----+---------+-------+
    */
    const uidMap: Record<string, number> = {};
    const udocs = await query('SELECT * FROM `user`');
    const precheck = await UserModel.getMulti({ unameLower: { $in: udocs.map((u) => u.username.toLowerCase()) } }).toArray();
    if (precheck.length) throw new Error(`Conflict username: ${precheck.map((u) => u.unameLower).join(', ')}`);
    const originalRole = await DomainModel.getRoles(domainId);
    if (!originalRole.find((i) => i._id === 'vip')) {
        originalRole.push({ _id: 'vip', perm: originalRole.find((i) => i._id === 'default')?.perm || 0n });
        await DomainModel.setRoles(domainId, Object.fromEntries(originalRole.map((i) => [i._id, i.perm])));
    }
    for (let uidx = 0; uidx < udocs.length; uidx += 1) {
        const udoc = udocs[uidx];
        if (randomMail) delete udoc.email;
        let current = await UserModel.getByEmail(domainId, udoc.email || `${udoc.username}@jnoj.local`);
        current ||= await UserModel.getByUname(domainId, udoc.username);
        if (current) {
            report({ message: `duplicate user with email ${udoc.email}: ${current.uname},${udoc.username}` });
            uidMap[udoc.id] = current._id;
        } else {
            const uid = await UserModel.create(
                udoc.email || `${udoc.username}@jnoj.local`, udoc.username, '',
                null, '127.0.0.1', udoc.status === 10 ? SystemModel.get('default.priv') : 0,
            );
            uidMap[udoc.id] = uid;
            await UserModel.setById(uid, {
                loginat: udoc.updated_at,
                regat: udoc.created_at,
                hash: udoc.password_hash,
                salt: udoc.password_hash,
                hashType: 'jnoj',
            });
            await DomainModel.setUserInDomain(domainId, uid, {
                nSubmit: 0,
                nAccept: 0,
            });
            if ([20, 30].includes(udoc.role)) {
                await DomainModel.setUserRole(domainId, uid, udoc.role === 20 ? 'vip' : 'root');
            }
        }

        if (uidx % 100 === 0) {
            const progress = Math.round(((uidx + 1) / udocs.length) * 100);
            report({
                message: `user finished ${uidx + 1} / ${udocs.length} (${progress}%)`,
            });
        }
    }

    /*
        +--------------------+--------------+------+-----+---------+----------------+
        | Field              | Type         | Null | Key | Default | Extra          |
        +--------------------+--------------+------+-----+---------+----------------+
        | id                 | int          | NO   | PRI | NULL    | auto_increment |
        | title              | varchar(255) | YES  |     | NULL    |                |
        | description        | text         | YES  |     | NULL    |                |
        | input              | text         | YES  |     | NULL    |                |
        | output             | text         | YES  |     | NULL    |                |
        | sample_input       | text         | YES  |     | NULL    |                |
        | sample_output      | text         | YES  |     | NULL    |                |
        | spj                | smallint     | YES  |     | 0       |                |
        | hint               | text         | YES  |     | NULL    |                |
        | source             | varchar(255) | YES  |     | NULL    |                |
        | time_limit         | int          | YES  |     | NULL    |                |
        | memory_limit       | int          | YES  |     | NULL    |                |
        | status             | smallint     | YES  |     | 0       |                |
        | accepted           | int          | YES  |     | 0       |                |
        | submit             | int          | YES  |     | 0       |                |
        | solved             | int          | YES  |     | 0       |                |
        | tags               | text         | YES  |     | NULL    |                |
        | solution           | text         | YES  |     | NULL    |                |
        | created_at         | datetime     | YES  |     | NULL    |                |
        | created_by         | int          | YES  | MUL | NULL    |                |
        | updated_at         | datetime     | YES  |     | NULL    |                |
        | polygon_problem_id | int          | YES  |     | NULL    |                |
        +--------------------+--------------+------+-----+---------+----------------+
    */
    const pidMap: Record<string, number> = {};
    const [{ 'count(*)': pcount }] = await query('SELECT count(*) FROM `problem`');
    const step = 50n;
    await iterate(pcount, 50n, async (pageId: bigint) => {
        const pdocs = await query(`SELECT * FROM \`problem\` LIMIT ${Number(pageId * step)}, ${Number(step)}`);
        for (const pdoc of pdocs) {
            if (rerun) {
                const opdoc = await ProblemModel.get(domainId, `P${pdoc.id}`);
                if (opdoc) pidMap[pdoc.id] = opdoc.docId;
            }
            if (!pidMap[pdoc.id]) {
                const files = {};
                const markdown = [pdoc.description, pdoc.input, pdoc.output, pdoc.hint].some((i) => i?.includes('[md]'));
                const samples = [];
                const sampleInput = parsePhpArray(pdoc.sample_input);
                const sampleOutput = parsePhpArray(pdoc.sample_output);
                if (sampleInput[0]?.trim() || sampleOutput[0]?.trim()) samples.push([sampleInput[0]?.trim(), sampleOutput[0]?.trim()]);
                if (sampleInput[1]?.trim() || sampleOutput[1]?.trim()) samples.push([sampleInput[1]?.trim(), sampleOutput[1]?.trim()]);
                if (sampleInput[2]?.trim() || sampleOutput[2]?.trim()) samples.push([sampleInput[2]?.trim(), sampleOutput[2]?.trim()]);
                let content = buildContent({
                    description: pdoc.description,
                    input: pdoc.input,
                    output: pdoc.output,
                    samples,
                    hint: pdoc.hint,
                    source: pdoc.source,
                }, 'html').replace(/<math xm<x>lns=/g, '<math xmlns=').replace(/\[\/?md\]/g, '');
                const uploadFiles = [
                    ...content.matchAll(/(?:src|href)="\/uploads(\/.+?)"/g),
                    ...content.matchAll(/\(\/uploads(\/.+?)\)/g),
                ];
                for (const file of uploadFiles) {
                    try {
                        const fileWithPath = file[1];
                        const filename = fixFileName(path.basename(file[1]));
                        files[filename] = await fs.readFile(path.join(uploadDir, fileWithPath));
                        content = content.replace(`/uploads${fileWithPath}`, `file://${filename}`);
                    } catch (e) {
                        report({ message: `failed to read file: ${path.join(uploadDir, file[1])}` });
                    }
                }
                const tags = pdoc.tags?.split(',')?.map((i) => i.trim())?.filter((i) => i);
                if (pdoc.source) tags.push(...pdoc.source.split(' ').map((i) => i.trim()).filter((i) => i));
                const pid = await ProblemModel.add(
                    domainId, `P${pdoc.id}`, pdoc.title, content, 1, tags, { hidden: pdoc.status === 1 },
                );
                if (!markdown) await ProblemModel.edit(domainId, pid, { html: true });
                pidMap[pdoc.id] = pid;
                await Promise.all(Object.keys(files).map((filename) => ProblemModel.addAdditionalFile(domainId, pid, filename, files[filename])));
                if (Object.keys(files).length) report({ message: `move ${Object.keys(files).length} file for problem ${pid}` });
            }
            await ProblemModel.edit(domainId, pidMap[pdoc.id], {
                nAccept: pdoc.accepted,
                nSubmit: pdoc.submit,
                config: `time: ${pdoc.time_limit}s
memory: ${pdoc.memory_limit}m
`,
                owner: uidMap[pdoc.created_by] || 1,
                maintainer: [],
            });
            if (pdoc.solution) {
                const md = turndown.turndown(pdoc.solution);
                await SolutionModel.add(domainId, pidMap[pdoc.id], uidMap[pdoc.created_by] || 1, md);
            }
        }
    }, { every: 10n, namespace: 'problem', report });

    report({ message: 'problem finished' });

    /*  Group
        +-------------+--------------+------+-----+---------+----------------+
        | Field       | Type         | Null | Key | Default | Extra          |
        +-------------+--------------+------+-----+---------+----------------+
        | id          | int          | NO   | PRI | NULL    | auto_increment |
        | name        | varchar(32)  | NO   |     | NULL    |                |
        | description | varchar(255) | NO   |     |         |                |
        | status      | tinyint      | NO   |     | NULL    |                |
        | join_policy | tinyint      | NO   |     | 0       |                |
        | created_by  | int          | NO   |     | NULL    |                |
        | created_at  | datetime     | NO   |     | NULL    |                |
        | updated_at  | datetime     | NO   |     | NULL    |                |
        +-------------+--------------+------+-----+---------+----------------+
        Group User
        +------------+----------+------+-----+---------+----------------+
        | Field      | Type     | Null | Key | Default | Extra          |
        +------------+----------+------+-----+---------+----------------+
        | id         | int      | NO   | PRI | NULL    | auto_increment |
        | group_id   | int      | NO   |     | NULL    |                |
        | user_id    | int      | NO   |     | NULL    |                |
        | role       | tinyint  | NO   |     | 0       |                |
        | created_at | datetime | NO   |     | NULL    |                |
        +------------+----------+------+-----+---------+----------------+
    */

    const groups = await query('SELECT * FROM `group`');
    const groupMap: Record<number, string> = {};
    const groupMembers: Record<string, number[]> = {};
    const escapeGroupName = (s: string) => {
        let val = s.replace(/[_:/\\[\] %$^&!=();'".,<>?*@#-]/g, '_').replace(/（/g, '(').replace(/）/g, ')')
            || Math.random().toString(36).substring(2, 15);
        while (Number.isSafeInteger(+val)) val = Math.random().toString(36).substring(2, 15);
        return val;
    };
    const groupsToRemove = [];
    for (const group of groups) {
        let n = escapeGroupName(group.name);
        if (_keepGroups.length && !_keepGroups.includes(n) && !_keepGroups.includes(group.name)) {
            if (hideExtraGroup) n = 'deleted';
            else {
                groupsToRemove.push(group.id);
                continue;
            }
        }
        const members = await query(`SELECT * FROM \`group_user\` WHERE \`group_id\` = ${group.id} AND \`role\` > 3`);
        groupMap[group.id] = n;
        groupMembers[n] = Array.from(new Set((groupMembers[n] || []).concat(members.map((i) => uidMap[i.user_id]))));
        await UserModel.updateGroup(domainId, n, groupMembers[n]);
    }

    /*  Contest
        +-----------------+--------------+------+-----+---------+----------------+
        | Field           | Type         | Null | Key | Default | Extra          |
        +-----------------+--------------+------+-----+---------+----------------+
        | id              | int          | NO   | PRI | NULL    | auto_increment |
        | title           | varchar(255) | YES  |     | NULL    |                |
        | start_time      | datetime     | YES  |     | NULL    |                |
        | end_time        | datetime     | YES  |     | NULL    |                |
        | lock_board_time | datetime     | YES  |     | NULL    |                |
        | status          | smallint     | YES  |     | NULL    |                |
        | editorial       | text         | YES  |     | NULL    |                |
        | description     | text         | YES  |     | NULL    |                |
        | type            | smallint     | NO   |     | 0       |                |
        | group_id        | int          | NO   |     | 0       |                |
        | scenario        | smallint     | NO   |     | 0       |                |
        | created_by      | int          | NO   | MUL | NULL    |                |
        +-----------------+--------------+------+-----+---------+----------------+
        Contest Problem
        +------------+----------+------+-----+---------+----------------+
        | Field      | Type     | Null | Key | Default | Extra          |
        +------------+----------+------+-----+---------+----------------+
        | id         | int      | NO   | PRI | NULL    | auto_increment |
        | problem_id | int      | NO   | MUL | NULL    |                |
        | contest_id | int      | NO   | MUL | NULL    |                |
        | num        | smallint | NO   |     | NULL    |                |
        +------------+----------+------+-----+---------+----------------+
        const TYPE_EDUCATIONAL = 0;
        const TYPE_RANK_SINGLE = 1;
        const TYPE_RANK_GROUP  = 2;
        const TYPE_HOMEWORK    = 3;
        const TYPE_OI          = 4;
        const TYPE_IOI         = 5;
    */
    const tidMap: Record<string, string> = {};
    const contestsToRemove = [];
    if (withContest) {
        const typeMap = ['acm', 'acm', 'acm', 'homework', 'oi', 'ioi'];
        const tdocs = await query('SELECT * FROM `contest`');
        for (let tidx = 0; tidx < tdocs.length; tidx += 1) {
            const tdoc = tdocs[tidx];
            if (tdoc.group_id && groupsToRemove.includes(tdoc.group_id)) {
                contestsToRemove.push(tdoc.id);
                continue;
            }
            const pdocs = await query(`SELECT * FROM \`contest_problem\` WHERE \`contest_id\` = ${tdoc.id} ORDER BY \`num\` ASC`);
            const pids = pdocs.map((i) => pidMap[i.problem_id]).filter((i) => i);
            const files = {};
            let description = tdoc.description || '';
            const markdownUploadFiles = description.matchAll(/\(\/uploads(\/.+?)\)/g);
            for (const file of markdownUploadFiles) {
                const fileWithPath = file[1];
                const filename = fixFileName(path.basename(file[1]));
                try {
                    files[filename] = await fs.readFile(path.join(uploadDir, fileWithPath));
                } catch (e) {
                    console.error('Failed to read file', fileWithPath, e);
                }
                description = description.replace(`/uploads${fileWithPath}`, `file://${filename}`);
            }
            tdoc.start_time ||= new Date(0);
            const endAt = (!tdoc.end_time || moment(tdoc.end_time).isSameOrBefore(tdoc.start_time))
                ? moment(tdoc.start_time).add(1, 'minute').toDate() : tdoc.end_time;
            const extra: Record<string, any> = {};
            if (typeMap[tdoc.type] === 'homework') {
                extra.penaltyRules = { 9999: 0 };
                extra.penaltySince = endAt;
            }
            if (tdoc.group_id) extra.assign = [groupMap[tdoc.group_id]];
            const tid = await ContestModel.add(
                domainId, tdoc.title, description || 'Description',
                uidMap[tdoc.created_by] || 1, typeMap[tdoc.type], tdoc.start_time, endAt, pids, true,
                extra,
            );
            tidMap[tdoc.id] = tid.toHexString();
            await Promise.all(Object.keys(files).map((filename) => addContestFile(domainId, tid, filename, files[filename])));
            if (Object.keys(files).length) report({ message: `move ${Object.keys(files).length} file for contest ${tidMap[tdoc.id]}` });
            if (tidx % 100 === 0) {
                const progress = Math.round(((tidx + 1) / tdocs.length) * 100);
                report({
                    message: `contest finished ${tidx + 1} / ${tdocs.length} (${progress}%)`,
                });
            }
        }
        report({ message: `contest finished, ${contestsToRemove.length} contests skipped (from removed groups)` });
    }

    /*
        +------------+--------------+------+-----+---------+----------------+
        | Field      | Type         | Null | Key | Default | Extra          |
        +------------+--------------+------+-----+---------+----------------+
        | id         | int          | NO   | PRI | NULL    | auto_increment |
        | parent_id  | int          | YES  | MUL | 0       |                |
        | title      | varchar(255) | YES  |     | NULL    |                |
        | created_by | int          | NO   | MUL | NULL    |                |
        | content    | text         | YES  |     | NULL    |                |
        | created_at | datetime     | NO   |     | NULL    |                |
        | updated_at | datetime     | NO   |     | NULL    |                |
        | status     | smallint     | NO   |     | 0       |                |
        | entity     | varchar(32)  | YES  | MUL | NULL    |                |
        | entity_id  | int          | YES  | MUL | NULL    |                |
        +------------+--------------+------+-----+---------+----------------+
    */
    const ddocs = await query('SELECT * FROM `discuss` WHERE `parent_id` = 0 AND `status` > 0');
    const discussRoots: Record<number, ObjectId> = {};
    const discussMap: Record<number, ObjectId> = {};
    const discussionsToRemove = [];
    for (const ddoc of ddocs) {
        const _id = Time.getObjectID(ddoc.created_at, false);
        const parentType = {
            problem: DocumentModel.TYPE_PROBLEM,
            contest: DocumentModel.TYPE_CONTEST,
            news: DocumentModel.TYPE_DISCUSSION_NODE,
        }[ddoc.entity];
        if (parentType === DocumentModel.TYPE_CONTEST && contestsToRemove.includes(ddoc.entity_id)) {
            discussionsToRemove.push(ddoc.id);
            continue;
        }
        const parentId = ddoc.entity === 'news' ? 'News'
            : ddoc.entity_id === 'problem' ? pidMap[ddoc.entity_id] : new ObjectId(tidMap[ddoc.entity_id]);
        if (!parentId) continue;
        const payload = {
            _id,
            domainId,
            content: ddoc.content,
            owner: uidMap[ddoc.created_by] || 1,
            editor: uidMap[ddoc.created_by] || 1,
            parentType,
            parentId,
            title: ddoc.title,
            ip: '127.0.0.1',
            nReply: 0,
            highlight: false,
            pin: false,
            updateAt: ddoc.updated_at || ddoc.created_at,
            views: 0,
            sort: 100,
            hidden: ddoc.status === 2,
            docType: DocumentModel.TYPE_DISCUSSION,
            docId: _id,
        };
        await Promise.all([
            DocumentModel.coll.insertOne(payload),
            DiscussionModel.coll.insertOne({
                domainId, docId: payload.docId, content: ddoc.content, uid: uidMap[ddoc.created_by] || 1, ip: '127.0.0.1', time: ddoc.created_at,
            }),
        ]);
        discussRoots[ddoc.id] = payload.docId;
        discussMap[ddoc.id] = payload.docId;
    }
    const drdocs = await query('SELECT * FROM `discuss` WHERE `parent_id` > 0 AND `status` > 0');
    for (const drdoc of drdocs) {
        if (discussionsToRemove.includes(drdoc.parent_id)) {
            discussionsToRemove.push(drdoc.id);
            continue;
        }
        const drid = await DiscussionModel.addReply(
            domainId, discussRoots[drdoc.parent_id], uidMap[drdoc.created_by] || 1,
            `${drdoc.title}\n${drdoc.content}`, '127.0.0.1',
        );
        discussRoots[drdoc.id] = drid;
    }
    report({ message: `discuss finished, ${discussionsToRemove.length} discussions skipped (from removed contests)` });

    /*
        +-------------+------------------+------+-----+---------+----------------+
        | Field       | Type             | Null | Key | Default | Extra          |
        +-------------+------------------+------+-----+---------+----------------+
        | id          | int              | NO   | PRI | NULL    | auto_increment |
        | problem_id  | int              | NO   | MUL | NULL    |                |
        | time        | int              | NO   |     | 0       |                |
        | memory      | int              | NO   |     | 0       |                |
        | created_at  | datetime         | NO   |     | NULL    |                |
        | source      | text             | NO   |     | NULL    |                |
        | result      | smallint         | NO   | MUL | 0       |                |
        | language    | smallint         | NO   |     | NULL    |                |
        | contest_id  | int              | YES  | MUL | NULL    |                |
        | status      | smallint         | NO   |     | NULL    |                |
        | code_length | int              | NO   |     | NULL    |                |
        | judgetime   | datetime         | YES  |     | NULL    |                |
        | pass_info   | varchar(255)     | YES  |     | NULL    |                |
        | score       | tinyint unsigned | NO   |     | 0       |                |
        | judge       | varchar(32)      | YES  |     | NULL    |                |
        | created_by  | int              | NO   | MUL | NULL    |                |
        +-------------+------------------+------+-----+---------+----------------+
        const OJ_WT0 = 0;
        const OJ_WT1 = 1;
        const OJ_CI  = 2;
        const OJ_RI  = 3;
        const OJ_AC  = 4;
        const OJ_PE  = 5;
        const OJ_WA  = 6;
        const OJ_TL  = 7;
        const OJ_ML  = 8;
        const OJ_OL  = 9;
        const OJ_RE  = 10;
        const OJ_CE  = 11;
        const OJ_SE  = 12;
        const OJ_NT  = 13;

        const CLANG = 0;
        const CPPLANG = 1;
        const JAVALANG = 2;
        const PYLANG = 3;
        const PASCALLANG = 4;
        Solution Info
        +-------------+----------+------+-----+---------+-------+
        | Field       | Type     | Null | Key | Default | Extra |
        +-------------+----------+------+-----+---------+-------+
        | solution_id | int      | NO   | PRI | NULL    |       |
        | run_info    | longtext | YES  |     | NULL    |       |
        +-------------+----------+------+-----+---------+-------+
    */
    const statusMap = {
        4: STATUS.STATUS_ACCEPTED,
        5: STATUS.STATUS_WRONG_ANSWER,
        6: STATUS.STATUS_WRONG_ANSWER,
        7: STATUS.STATUS_TIME_LIMIT_EXCEEDED,
        8: STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
        9: STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
        10: STATUS.STATUS_RUNTIME_ERROR,
        11: STATUS.STATUS_COMPILE_ERROR,
        12: STATUS.STATUS_SYSTEM_ERROR,
        13: STATUS.STATUS_SYSTEM_ERROR,
    };
    const langMap = {
        0: 'c',
        1: 'cc',
        2: 'java',
        3: 'py',
        4: 'pas',
    };
    const buildTestCases = (runInfo: string) => {
        try {
            const info = JSON.parse(runInfo);
            return {
                testCases: info.subtasks.flatMap((subtask: any, subtaskId: number) => subtask.cases.map((cas: any, caseId: number) => ({
                    subtaskId: subtaskId + 1,
                    id: caseId + 1,
                    status: statusMap[cas.verdict] || STATUS.STATUS_WAITING,
                    time: cas.time || 0,
                    memory: cas.memory || 0,
                    message: cas.checker_log
                        || (cas.exit_code ? `Exit code: ${cas.exit_code}`
                            : cas.checker_exit_code ? `Checker exit code: ${cas.checker_exit_code}` : ''),
                }))),
            };
        } catch (e) {
            return {
                compilerTexts: [runInfo],
            };
        }
    };

    const [{ 'count(*)': rcount }] = await query('SELECT count(*) FROM `solution` WHERE `problem_id` > 0 AND `status` != 2');
    const attended = {};
    let recordSkipped = 0n;
    await iterate(rcount, 50n, async (pageId: bigint) => {
        const rdocs = await query(`SELECT * FROM \`solution\` WHERE \`problem_id\` > 0 LIMIT ${pageId * BigInt(step)}, ${step}`);
        const solInfos = await query(`SELECT * FROM \`solution_info\` WHERE \`solution_id\` IN (${rdocs.map((i) => i.id).join(',')})`);
        const solInfoMap = _.keyBy(solInfos, 'solution_id');
        for (const rdoc of rdocs) {
            if (rdoc.contest_id && contestsToRemove.includes(rdoc.contest_id)) {
                recordSkipped++;
                continue;
            }
            const data: RecordDoc = {
                status: statusMap[rdoc.result] || STATUS.STATUS_WAITING,
                _id: Time.getObjectID(rdoc.created_at, false),
                uid: uidMap[rdoc.created_by] || 0,
                code: rdoc.source,
                lang: langMap[rdoc.language] || '',
                pid: pidMap[rdoc.problem_id] || 0,
                domainId,
                score: rdoc.score,
                time: rdoc.time || 0,
                memory: rdoc.memory || 0,
                judgeTexts: [],
                compilerTexts: [],
                testCases: [],
                judgeAt: new Date(),
                rejudged: false,
                judger: 1,
                ...buildTestCases(solInfoMap[rdoc.id]?.run_info || '{}'),
            };
            if (rdoc.contest_id && withContest) {
                if (!tidMap[rdoc.contest_id]) {
                    report({ message: `warning: contest_id ${rdoc.contest_id} for submission ${rdoc.id} not found` });
                } else {
                    data.contest = new ObjectId(tidMap[rdoc.contest_id]);
                    if (!attended[`${data.contest}/${rdoc.created_by}`]) {
                        await ContestModel.attend(domainId, data.contest, uidMap[rdoc.created_by]).catch(noop);
                        attended[`${data.contest}/${rdoc.created_by}`] = true;
                    }
                }
            }
            await RecordModel.coll.insertOne(data);
            await postJudge(data).catch((err) => {
                report({ message: err.message });
                console.log(err, data);
            });
        }
    }, { every: 10n, namespace: 'record', report });
    report({ message: `record finished, ${recordSkipped} records skipped (from removed contests)` });

    src.end();

    if (!dataDir) return true;
    if (dataDir.endsWith('/')) dataDir = dataDir.slice(0, -1);
    const files = await fs.readdir(dataDir, { withFileTypes: true });
    for (const file of files) {
        if (!file.isDirectory()) continue;
        const datas = await fs.readdir(`${dataDir}/${file.name}`, { withFileTypes: true });
        const pdoc = await ProblemModel.get(domainId, `P${file.name}`, undefined, true);
        if (!pdoc) continue;
        report({ message: `Syncing testdata for ${file.name}` });
        for (const data of datas) {
            if (data.isDirectory()) continue;
            const filename = fixFileName(data.name);
            await ProblemModel.addTestdata(domainId, pdoc.docId, filename, `${dataDir}/${file.name}/${data.name}`);
        }
        await ProblemModel.addTestdata(domainId, pdoc.docId, 'config.yaml', Buffer.from(pdoc.config as string));
    }
    await SystemModel.set('migrate.lock', 0);
    return true;
}
