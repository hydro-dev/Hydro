/* eslint-disable no-await-in-loop */
import mariadb from 'mariadb';
import {
    buildContent, ContestModel, DiscussionDoc, DiscussionReplyDoc, DocumentModel, DomainModel,
    fs, noop, NotFoundError, ObjectId, PERM, postJudge, ProblemModel, RecordDoc, RecordModel,
    STATUS, SystemModel, Time, UserModel, yaml,
} from 'hydrooj';

const contentTypeMap = {
    noi: 'oi',
    ioi: 'ioi',
    acm: 'acm',
};
const statusMap = {
    Accepted: STATUS.STATUS_ACCEPTED,
    'Compile Error': STATUS.STATUS_COMPILE_ERROR,
    'File Error': STATUS.STATUS_WRONG_ANSWER,
    'Invalid Interaction': STATUS.STATUS_FORMAT_ERROR,
    'Judgement Failed': STATUS.STATUS_SYSTEM_ERROR,
    'Memory Limit Exceeded': STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    'No Testdata': STATUS.STATUS_FORMAT_ERROR,
    'Output Limit Exceeded': STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
    'Partially Correct': STATUS.STATUS_WRONG_ANSWER,
    'Runtime Error': STATUS.STATUS_RUNTIME_ERROR,
    'System Error': STATUS.STATUS_SYSTEM_ERROR,
    'Time Limit Exceeded': STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    Unknown: STATUS.STATUS_SYSTEM_ERROR,
    'Wrong Answer': STATUS.STATUS_WRONG_ANSWER,
    Waiting: STATUS.STATUS_WAITING,
    Cheated: STATUS.STATUS_CANCELED,
};
const TestcaseStatusMap = {
    0: STATUS.STATUS_WAITING,
    1: STATUS.STATUS_JUDGING,
    3: STATUS.STATUS_SYSTEM_ERROR,
    4: STATUS.STATUS_IGNORED,
};
const TestcaseJudgeStatusMap = {
    1: STATUS.STATUS_ACCEPTED,
    2: STATUS.STATUS_WRONG_ANSWER,
    3: STATUS.STATUS_WRONG_ANSWER,
    4: STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    5: STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    6: STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
    7: STATUS.STATUS_WRONG_ANSWER,
    8: STATUS.STATUS_RUNTIME_ERROR,
    9: STATUS.STATUS_SYSTEM_ERROR,
    10: STATUS.STATUS_FORMAT_ERROR,
};
const sexMap = {
    0: 3,
    1: 1,
    [-1]: 2,
};
const langMap = {
    cpp: 'cc.cc98',
    cpp11: 'cc.cc11',
    cpp17: 'cc.cc17',
    'cpp-noilinux': 'cc.cc98',
    'cpp11-noilinux': 'cc.cc11',
    'cpp11-clang': 'cc.cc11',
    'cpp17-clang': 'cc.cc17',
    c: 'c',
    'c-noilinux': 'c',
    csharp: 'cs',
    java: 'java',
    pascal: 'pas',
    python2: 'py.py2',
    python3: 'py.py3',
    nodejs: 'js',
    ruby: 'rb',
    haskell: 'hs',
};
export async function run({
    host = 'localhost', port = 3306, name = 'syzoj',
    username, password, domainId, dataDir,
    rerun = true, randomMail = 'never',
}, report: (data: any) => void) {
    const src = await mariadb.createConnection({
        host,
        port,
        user: username,
        password,
        database: name,
        connectTimeout: 15000,
    });
    const query = (q: string) => new Promise<any[]>((res, rej) => {
        src.query(q).then((r) => res(r)).catch((e) => rej(e));
    });
    const target = await DomainModel.get(domainId);
    if (!target) throw new NotFoundError(domainId);
    report({ message: 'Connected to database' });
    /*
        `id` int NOT NULL AUTO_INCREMENT, 用户id（主键）
        `username` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL, 用户名
        `email` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL, 用户E-mail
        `password` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL, 密码
        `nickname` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL, 昵称
        `nameplate` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        `information` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL, 个人信息
        `ac_num` int NULL DEFAULT NULL,  AC数量
        `submit_num` int NULL DEFAULT NULL, 提交数量
        `is_admin` tinyint NULL DEFAULT NULL, 是否为管理员
        `is_show` tinyint NULL DEFAULT NULL, 是否公开信息
        `public_email` tinyint NULL DEFAULT 1, 是否公开E-mail
        `prefer_formatted_code` tinyint NULL DEFAULT 1, 是否使用格式化代码
        `sex` int NULL DEFAULT NULL, 性别
        `rating` int NULL DEFAULT NULL,
        `register_time` int NULL DEFAULT NULL, 注册时间
    */
    const uidMap: Record<string, number> = {};
    const superAdmin = [];
    const udocs = await query('SELECT * FROM `user`');
    report({ message: udocs.map((u) => u.username.toLowerCase()) });
    const precheck = await UserModel.getMulti({ unameLower: { $in: udocs.map((u) => u.username.toLowerCase()) } }).toArray();
    if (precheck.length) throw new Error(`Conflict username: ${precheck.map((u) => u.unameLower).join(', ')}`);
    for (const udoc of udocs) {
        if (randomMail === 'always' || !udoc.email.includes('@')) delete udoc.email;
        let current = await UserModel.getByEmail(domainId, udoc.email || `${udoc.username}@syzoj.local`);
        current ||= await UserModel.getByUname(domainId, udoc.username);
        if (current && randomMail === 'needed') {
            delete udoc.email;
            current = await UserModel.getByEmail(domainId, udoc.email || `${udoc.username}@syzoj.local`);
        }
        if (current) {
            report({ message: `duplicate user with email ${udoc.email}: ${current.uname},${udoc.username}` });
            uidMap[udoc.id] = current._id;
        } else {
            const uid = await UserModel.create(
                udoc.email || `${udoc.username}@syzoj.local`, udoc.username, '',
                null, udoc.ip, SystemModel.get('default.priv'),
            );
            if (udoc.is_admin) {
                await UserModel.setSuperAdmin(uid);
                superAdmin.push(uid);
            }
            uidMap[udoc.id] = uid;
            await UserModel.setById(uid, {
                regat: new Date(udoc.register_time * 1000),
                hash: udoc.password,
                salt: udoc.password,
                hashType: 'syzoj',
                bio: udoc.information || '',
                gender: sexMap[udoc.sex] || 3,
            });
            await DomainModel.setUserInDomain(domainId, uid, {
                displayName: udoc.nickname || '',
                nSubmit: udoc.submit_num,
                nAccept: udoc.ac_num,
                join: true,
            });
        }
    }

    // I think manage_problem_tag is a useless role
    await DomainModel.addRole(domainId, 'manage_problem',
        PERM.PERM_DEFAULT | PERM.PERM_CREATE_PROBLEM | PERM.PERM_EDIT_PROBLEM | PERM.PERM_VIEW_PROBLEM_HIDDEN | PERM.PERM_READ_PROBLEM_DATA
        | PERM.PERM_EDIT_PROBLEM_SOLUTION | PERM.PERM_DELETE_PROBLEM_SOLUTION | PERM.PERM_DELETE_PROBLEM_SOLUTION_REPLY);
    await DomainModel.addRole(domainId, 'manage_user', PERM.PERM_DEFAULT | PERM.PERM_EDIT_DOMAIN);
    const privileges = await query('SELECT user_id,group_concat(privilege) as privilege FROM `user_privilege` group by user_id');
    for (const privilege of privileges) {
        if (!superAdmin.includes(privilege.user_id)) {
            if (privilege.privilege.split(',').includes('manage_problem') && privilege.privilege.split(',').includes('manage_user')) {
                await DomainModel.setUserRole(domainId, uidMap[privilege.user_id], 'root');
            } else if (privilege.privilege.split(',').includes('manage_problem')) {
                await DomainModel.setUserRole(domainId, uidMap[privilege.user_id], 'manage_problem');
            } else if (privilege.privilege.split(',').includes('manage_user')) {
                await DomainModel.setUserRole(domainId, uidMap[privilege.user_id], 'manage_user');
            }
        }
    }
    report({ message: 'user finished' });

    const allTags = await query('SELECT * FROM `problem_tag`');
    const tagMap: Record<number, string> = {};
    for (const tag of allTags) tagMap[tag.id] = tag.name;
    report({ message: 'tag finished' });

    /*
        `id` int NOT NULL AUTO_INCREMENT,
        `title` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
        `user_id` int NULL DEFAULT NULL,
        `publicizer_id` int NULL DEFAULT NULL,
        `is_anonymous` tinyint NULL DEFAULT NULL,
        `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        `input_format` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        `output_format` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        `example` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        `limit_and_hint` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        `time_limit` int NULL DEFAULT NULL,
        `memory_limit` int NULL DEFAULT NULL,
        `additional_file_id` int NULL DEFAULT NULL,
        `ac_num` int NULL DEFAULT NULL,
        `submit_num` int NULL DEFAULT NULL,
        `is_public` tinyint NULL DEFAULT NULL,
        `file_io` tinyint NULL DEFAULT NULL,
        `file_io_input_name` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        `file_io_output_name` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        `publicize_time` datetime NULL DEFAULT NULL, 公开时间
        `type` enum('traditional','submit-answer','interaction') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'traditional',
    */
    const fileReg = /\[.*\]\((\/problem\/(\d+)\/testdata\/download\/(.*))\)/g;
    const pidMap: Record<string, number> = {};
    const configMap: Record<string, string> = {};
    const problemAdditionalFile = {};
    const [{ 'count(*)': pcount }] = await query('SELECT count(*) FROM `problem`');
    const step = 50;
    const pageCount = Math.ceil(Number(pcount) / step);
    for (let pageId = 0; pageId < pageCount; pageId++) {
        const pdocs = await query(`SELECT * FROM \`problem\` LIMIT ${pageId * step}, ${step}`);
        for (const pdoc of pdocs) {
            if (rerun) {
                const opdoc = await ProblemModel.get(domainId, `P${pdoc.id}`);
                if (opdoc) pidMap[pdoc.id] = opdoc.docId;
            }
            if (!pidMap[pdoc.id]) {
                let content = buildContent({
                    description: pdoc.description,
                    input: pdoc.input_format,
                    output: `${pdoc.output_format}\n## Sample\n${pdoc.example}`,
                    samples: [],
                    hint: pdoc.limit_and_hint,
                });
                for (const match of content.matchAll(fileReg)) {
                    const [, origialPath, pid, filename] = match;
                    if (!problemAdditionalFile[`P${pdoc.id}`]) problemAdditionalFile[`P${pdoc.id}`] = [{ fromPid: pid, filename }];
                    else problemAdditionalFile[`P${pdoc.id}`].push({ fromPid: pid, filename });
                    content = content.replace(origialPath, `file://${filename}`);
                }
                const pid = await ProblemModel.add(domainId, `P${pdoc.id}`, pdoc.title, content, uidMap[pdoc.user_id] || 1);
                pidMap[pdoc.id] = pid;
            }
            const tags = await query(`SELECT * FROM \`problem_tag_map\` WHERE \`problem_id\` = ${pdoc.id}`);
            const tagList = [];
            for (const tag of tags) tagList.push(tagMap[tag.tag_id]);
            await ProblemModel.edit(domainId, pidMap[pdoc.id], {
                nAccept: pdoc.ac_num || 0,
                nSubmit: pdoc.submit_num || 0,
                hidden: pdoc.is_public !== 1,
                tag: tagList,
            });
            configMap[`P${pdoc.id}`] = `type: ${({ traditional: 'default', 'submit-answer': 'submit_answer' })[pdoc.type] || pdoc.type}
\ntime: ${pdoc.time_limit}ms\nmemory: ${pdoc.memory_limit}m${pdoc.file_io ? `\nfilename: ${pdoc.file_io_input_name.split('.')[0]}` : ''}`;
            if (pdoc.additional_file_id) {
                const additionalFile = await query(`SELECT * FROM \`file\` WHERE \`id\` = ${pdoc.additional_file_id}`);
                if (additionalFile.length) {
                    const [afdoc] = additionalFile;
                    await ProblemModel.addAdditionalFile(domainId, pidMap[pdoc.id],
                        `additional_file_${pdoc.additional_file_id}.zip`, `${dataDir}/additional_file/${afdoc.md5}`);
                }
            }
        }
    }
    report({ message: 'problem finished' });

    /*
        id: number; @TypeORM.PrimaryGeneratedColumn()
        title: string; @TypeORM.Column({ nullable: true, type: "varchar", length: 80 })
        subtitle: string; @TypeORM.Column({ nullable: true, type: "text" })
        start_time: number; @TypeORM.Column({ nullable: true, type: "integer" })
        end_time: number; @TypeORM.Column({ nullable: true, type: "integer" })
        holder_id: number; @TypeORM.Column({ nullable: true, type: "integer" })
        type: ContestType; // type: noi, ioi, acm
        information: string; @TypeORM.Column({ nullable: true, type: "text" })
        problems: string; @TypeORM.Column({ nullable: true, type: "text" })
        admins: string;  @TypeORM.Column({ nullable: true, type: "text" })
        ranklist_id: number; @TypeORM.Column({ nullable: true, type: "integer" })
        is_public: boolean; @TypeORM.Column({ nullable: true, type: "boolean" })
        hide_statistics: boolean; @TypeORM.Column({ nullable: true, type: "boolean" })
        holder?: User;
        ranklist?: ContestRanklist;
    */
    const ratedTids = (await query('SELECT `contest_id` FROM `rating_calculation`')).map(({ contest_id: id }) => id);
    const tidMap: Record<string, string> = {};
    const tdocs = await query('SELECT * FROM `contest`');
    for (const tdoc of tdocs) {
        const pdocs = tdoc.problems.split('|').map((i) => i.trim());
        const pids = pdocs.map((i) => pidMap[i]).filter((i) => i);
        const admin = uidMap[tdoc.holder_id] || uidMap[tdoc.admins.split('|')[0]];
        const startAt = new Date(tdoc.start_time * 1000);
        let endAt = new Date(tdoc.end_time * 1000);
        if (startAt >= endAt) {
            report({ message: `Invalid contest time: ${tdoc.title} ${tdoc.start_time} ${tdoc.end_time}` });
            endAt = new Date(startAt.getTime() + 5000);
        }
        const tid = await ContestModel.add(
            domainId, tdoc.title, `${tdoc.subtitle ? `#### ${tdoc.subtitle}\n` : ''}${tdoc.information || 'No Description'}`,
            admin, contentTypeMap[tdoc.type], startAt, endAt,
            pids, ratedTids.includes(tdoc.id), { maintainer: tdoc.admins.split('|').map((i) => uidMap[i]), assign: [] },
        );
        tidMap[tdoc.id] = tid.toHexString();
    }
    report({ message: 'contest finished' });

    /*
        `id` int NOT NULL AUTO_INCREMENT,
        `code` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        `language` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
        `status` statusMap
        `task_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
        `score` int NULL DEFAULT 0,
        `total_time` int NULL DEFAULT 0,
        `code_length` int NULL DEFAULT 0,
        `pending` tinyint NULL DEFAULT 0,
        `max_memory` int NULL DEFAULT 0,
        `compilation` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        `result` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        `user_id` int NULL DEFAULT NULL,
        `problem_id` int NULL DEFAULT NULL,
        `submit_time` int NULL DEFAULT NULL,

        * "type" indicate it's contest's submission(type = 1) or normal submission(type = 0)
        * if it's contest's submission (type = 1), the type_info is contest_id
        `type` int NULL DEFAULT NULL,
        `type_info` int NULL DEFAULT NULL,

        `is_public` tinyint NULL DEFAULT NULL,
    */
    const [{ 'count(*)': rcount }] = await query('SELECT count(*) FROM `judge_state`');
    const rpageCount = Math.ceil(Number(rcount) / step);
    for (let pageId = 0; pageId < rpageCount; pageId++) {
        const rdocs = await query(`SELECT * FROM \`judge_state\` LIMIT ${pageId * step}, ${step}`);
        for (const rdoc of rdocs) {
            const data: RecordDoc = {
                status: statusMap[rdoc.status] || 0,
                _id: Time.getObjectID(new Date(rdoc.submit_time * 1000), false),
                uid: uidMap[rdoc.user_id] || 0,
                code: rdoc.code,
                lang: langMap[rdoc.language] || '',
                pid: pidMap[rdoc.problem_id] || 0,
                domainId,
                score: rdoc.score || 0,
                time: rdoc.total_time || 0,
                memory: rdoc.max_memory || 0,
                judgeTexts: [],
                compilerTexts: [],
                testCases: [],
                judgeAt: new Date(),
                rejudged: false,
                judger: 1,
            };
            const judgeState = JSON.parse(rdoc.result);
            if (judgeState) {
                if (judgeState.compile?.message) data.compilerTexts.push(judgeState.compile.message.replace(/<.+?>/g, ''));
                if (judgeState.judge) {
                    for (let i = 0; i < judgeState.judge.subtasks.length; i++) {
                        const subtask = judgeState.judge.subtasks[i];
                        for (let j = 0; j < subtask.cases.length; j++) {
                            const curCase = subtask.cases[j];
                            data.testCases.push({
                                subtaskId: i + 1,
                                id: j + 1,
                                score: Math.trunc((curCase.result?.scoringRate || 0) * 100),
                                time: curCase.result?.time || 0,
                                memory: curCase.result?.memory || 0,
                                message: curCase.result?.spjMessage || curCase.result?.systemMessage || curCase.result?.userError || '',
                                status: curCase.status === 2 ? TestcaseJudgeStatusMap[curCase.result.type] : TestcaseStatusMap[curCase.status],
                            });
                        }
                    }
                }
            }
            if (rdoc.type && rdoc.type_info && tidMap[rdoc.type_info]) {
                data.contest = new ObjectId(tidMap[rdoc.type_info]);
                await ContestModel.attend(domainId, data.contest, uidMap[rdoc.user_id]).catch(noop);
            }
            await RecordModel.coll.insertOne(data);
            await postJudge(data).catch((err) => report({ message: err.message }));
        }
    }
    report({ message: 'record finished' });

    /* article
       `id` int(11) NOT NULL AUTO_INCREMENT,
       `title` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
       `content` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
       `user_id` int(11) NULL DEFAULT NULL,
       `problem_id` int(11) NULL DEFAULT NULL,
       `public_time` int(11) NULL DEFAULT NULL,
       `update_time` int(11) NULL DEFAULT NULL,
       `sort_time` int(11) NULL DEFAULT NULL,
       `comments_num` int(11) NOT NULL DEFAULT 0,
       `allow_comment` tinyint(4) NOT NULL DEFAULT 1,
       `is_notice` tinyint(4) NULL DEFAULT NULL,
        */
    const ddocs = await query('SELECT * FROM `article`');
    const didMap = {};
    for (const ddoc of ddocs) {
        const _id = Time.getObjectID(new Date(ddoc.public_time * 1000), false);
        const data: Partial<DiscussionDoc> = {
            _id,
            docType: DocumentModel.TYPE_DISCUSSION,
            docId: _id,
            owner: uidMap[ddoc.user_id] || 0,
            title: ddoc.title,
            content: ddoc.content,
            domainId,
            updateAt: new Date(ddoc.update_time * 1000),
            nReply: ddoc.comments_num,
            views: 0,
            lock: ddoc.allow_comment === 0,
            pin: ddoc.is_notice === 1,
            highlight: ddoc.is_notice === 1,
            parentType: ddoc.problem_id ? DocumentModel.TYPE_PROBLEM : DocumentModel.TYPE_DISCUSSION_NODE,
            parentId: pidMap[ddoc.problem_id] || 'Hydro',
            ip: '127.0.0.1',
        };
        await DocumentModel.coll.insertOne(data);
        didMap[ddoc.id] = data._id;
    }

    /* article_comment
       `id` int(11) NOT NULL AUTO_INCREMENT,
       `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
       `article_id` int(11) NULL DEFAULT NULL,
       `user_id` int(11) NULL DEFAULT NULL,
       `public_time` int(11) NULL DEFAULT NULL,
    */
    const drdocs = await query('SELECT * FROM `article_comment`');
    for (const drdoc of drdocs) {
        const _id = Time.getObjectID(new Date(drdoc.public_time * 1000), false);
        const data: Partial<DiscussionReplyDoc> = {
            _id,
            domainId,
            docId: _id,
            docType: DocumentModel.TYPE_DISCUSSION_REPLY,
            content: drdoc.content,
            owner: uidMap[drdoc.user_id],
            parentType: DocumentModel.TYPE_DISCUSSION,
            parentId: didMap[drdoc.article_id],
            ip: '127.0.0.1',
        };
        await DocumentModel.coll.insertOne(data);
    }
    report({ message: 'article finished' });

    src.end();

    if (!dataDir) return true;
    if (dataDir.endsWith('/')) dataDir = dataDir.slice(0, -1);
    const files = await fs.readdir(`${dataDir}/testdata/`, { withFileTypes: true });
    for (const file of files) {
        if (!file.isDirectory()) continue;
        const datas = await fs.readdir(`${dataDir}/testdata/${file.name}`, { withFileTypes: true });
        const pdoc = await ProblemModel.get(domainId, `P${file.name}`, undefined, true);
        if (!pdoc) continue;
        report({ message: `Syncing testdata for ${file.name}` });
        for (const data of datas) {
            if (data.isDirectory()) continue;
            await ProblemModel.addTestdata(domainId, pdoc.docId, data.name, `${dataDir}/testdata/${file.name}/${data.name}`);
            if (data.name.startsWith('spj_')) {
                report({ message: `Syncing spj for ${file.name}` });
                await ProblemModel.addTestdata(domainId, pdoc.docId,
                    `spj.${langMap[data.name.split('spj_')[1].split('.')[0]]}`, `${dataDir}/testdata/${file.name}/${data.name}`);
                pdoc.config += `\nchecker_type: syzoj\nchecker: spj.${langMap[data.name.split('spj_')[1].split('.')[0]]}`;
            }
        }
        if (!(datas.find((i) => i.name === 'data.yml'))) {
            await ProblemModel.addTestdata(domainId, pdoc.docId, 'config.yaml', Buffer.from(configMap[`P${file.name}`]));
        } else {
            report({ message: `Transfering data.yml for ${file.name}` });
            const config = yaml.load(configMap[`P${file.name}`]) as any;
            const syzojConfig = yaml.load(fs.readFileSync(`${dataDir}/testdata/${file.name}/data.yml`, 'utf8').toString()) as any;
            if (syzojConfig.specialJudge) {
                report({ message: `Syncing spj config for ${file.name}` });
                config.checker_type = 'syzoj';
                await ProblemModel.addTestdata(domainId, pdoc.docId,
                    `spj.${langMap[syzojConfig.specialJudge.language]}`, `${dataDir}/testdata/${file.name}/${syzojConfig.specialJudge.fileName}`);
                config.checker = `spj.${langMap[syzojConfig.specialJudge.language]}`;
            }
            if (syzojConfig.subtasks && syzojConfig.inputFile && syzojConfig.outputFile) {
                config.subtasks = syzojConfig.subtasks.map((subtask, index) => ({
                    score: subtask.score,
                    id: index + 1,
                    type: subtask.type,
                    cases: subtask.cases.map((caseItem) => ({
                        input: syzojConfig.inputFile.replace('#', caseItem),
                        output: syzojConfig.outputFile.replace('#', caseItem),
                    })),
                }));
            }
            if (syzojConfig.extraSourceFiles?.length === 1) {
                for (const { name: sourceName, dest } of syzojConfig.extraSourceFiles[0].files) {
                    await ProblemModel.addTestdata(domainId, pdoc.docId, dest,
                        `${dataDir}/testdata/${file.name}/${sourceName}`);
                }
                config.user_extra_files = syzojConfig.extraSourceFiles[0].files.map((x) => x.dest);
            } else if (syzojConfig.extraSourceFiles?.length > 1) {
                report({ message: `Multiple extra source files are not supported for ${file.name}` });
            }
            if (config.type === 'submit_answer') {
                config.subType = 'multi';
                config.filename = syzojConfig.outputFile;
            }
            if (syzojConfig.interactor) {
                report({ message: `Syncing interactor config for ${file.name}` });
                config.type = 'interactive';
                await ProblemModel.addTestdata(domainId, pdoc.docId,
                    `spj.${langMap[syzojConfig.interactor.language]}`, `${dataDir}/testdata/${file.name}/${syzojConfig.interactor.fileName}`);
                config.interactor = `spj.${langMap[syzojConfig.interactor.language]}`;
            }
            await ProblemModel.addTestdata(domainId, pdoc.docId, 'config.yaml', Buffer.from(yaml.dump(config)));
        }
        if (problemAdditionalFile[`P${file.name}`]) {
            report({ message: `Syncing additional_file for ${file.name}` });
            for (const data of problemAdditionalFile[`P${file.name}`]) {
                if (!fs.existsSync(`${dataDir}/testdata/${data.fromPid}/${decodeURIComponent(data.filename)}`)) continue;
                await ProblemModel.addAdditionalFile(domainId, pdoc.docId, data.filename,
                    `${dataDir}/testdata/${data.fromPid}/${decodeURIComponent(data.filename)}`);
            }
        }
    }
    return true;
}
