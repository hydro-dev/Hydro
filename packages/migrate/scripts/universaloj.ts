/* eslint-disable no-await-in-loop */
import mariadb from 'mariadb';
import xml2js from 'xml2js';
import {
    ContestModel, DomainModel, fs, MessageModel, moment,
    noop, NotFoundError, ObjectId, postJudge, ProblemConfigFile, ProblemModel, RecordDoc, RecordModel,
    STATUS, SubtaskType, SystemModel, Time, UserModel, ValidationError, yaml, Zip,
} from 'hydrooj';
const statusMap = {
    Accepted: STATUS.STATUS_ACCEPTED,
    'Compile Error': STATUS.STATUS_COMPILE_ERROR,
    'Wrong Answer': STATUS.STATUS_WRONG_ANSWER,
    'Runtime Error': STATUS.STATUS_RUNTIME_ERROR,
    'Memory Limit Exceeded': STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    'Time Limit Exceeded': STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    'Output Limit Exceeded': STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
    'Dangerous Syscalls': STATUS.STATUS_RUNTIME_ERROR,
    'Judgement Failed': STATUS.STATUS_SYSTEM_ERROR,
    'No Comment': STATUS.STATUS_SYSTEM_ERROR,
    Skippped: STATUS.STATUS_CANCELED,
    Judging: STATUS.STATUS_JUDGING,
};
const sexMap = {
    U: 3,
    M: 1,
    F: 2,
};
const langMap = {
    C: 'c',
    'C++': 'cc.cc98',
    'C++11': 'cc.cc11',
    Java8: 'java',
    Java11: 'java',
    Pascal: 'pas',
    Python2: 'py.py2',
    Python3: 'py.py3',
};
function handleMailLower(mail: string) {
    const [n, d] = mail.trim().toLowerCase().split('@');
    const [name] = n.split('+');
    return `${name.replace(/\./g, '')}@${d === 'googlemail.com' ? 'gmail.com' : d}`;
}

export async function run({
    host = '172.17.0.2', port = 3306, name = 'app_uoj233',
    username, password, domainId, dataDir,
    rerun = true, randomMail = false,
}, report: (data: any) => void) {
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
    const target = await DomainModel.get(domainId);
    if (!target) throw new NotFoundError(domainId);
    report({ message: 'Connected to database' });
    /*
        CREATE TABLE `user_info` (
        `usergroup` char(1) NOT NULL DEFAULT 'U',
        `username` varchar(20) NOT NULL,
        `email` varchar(50) NOT NULL,
        `password` char(32) NOT NULL,
        `svn_password` char(10) NOT NULL,
        `rating` int(11) NOT NULL DEFAULT '1500',
        `qq` bigint(20) NOT NULL,
        `sex` char(1) NOT NULL DEFAULT 'U',
        `ac_num` int(11) NOT NULL,
        `register_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `remote_addr` varchar(50) NOT NULL,
        `http_x_forwarded_for` varchar(50) NOT NULL,
        `remember_token` char(60) NOT NULL,
        `motto` varchar(200) NOT NULL,
        `cellphone` varchar(15) NOT NULL,
        PRIMARY KEY (`username`),
        KEY `rating` (`rating`,`username`),
        KEY `ac_num` (`ac_num`,`username`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
    */
    const configFile = await fs.readFile(`${dataDir}/opt/uoj/web/app/.config.php`, 'utf8');
    const salt = configFile.match(/'client_salt' => '(.+?)'/)[1];
    const uidMap: Record<string, number> = {};
    const udocs = await query('SELECT * FROM `user_info`');
    const priv = await SystemModel.get('default.priv');
    report({ message: udocs.map((u) => u.username.toLowerCase()) });
    const precheck = await UserModel.getMulti({ unameLower: { $in: udocs.map((u) => u.username.toLowerCase()) } }).toArray();
    if (precheck.length) throw new Error(`Conflict username: ${precheck.map((u) => u.unameLower).join(', ')}`);
    for (const udoc of udocs) {
        if (randomMail) delete udoc.email;
        let current = await UserModel.getByEmail(domainId, udoc.email || `${udoc.username}@universaloj.local`);
        current ||= await UserModel.getByUname(domainId, udoc.username);
        if (current) {
            report({ message: `duplicate user with email ${udoc.email}: ${current.uname},${udoc.username}` });
            uidMap[udoc.username] = current._id;
        } else {
            const [u] = await UserModel.coll.find({}).sort({ _id: -1 }).limit(1).toArray();
            const uid = Math.max((u?._id || 0) + 1, 2);
            await UserModel.coll.insertOne({
                _id: uid,
                uname: udoc.username,
                unameLower: udoc.username.toLowerCase(),
                mail: udoc.email || `${udoc.username}@universaloj.local`,
                mailLower: handleMailLower(udoc.email || `${udoc.username}@universaloj.local`),
                regat: new Date(udoc.register_time),
                hash: udoc.password,
                salt,
                hashType: 'uoj',
                ip: [udoc.http_x_forwarded_for || udoc.remote_addr || '127.0.0.1'],
                loginat: new Date(),
                loginip: '127.0.0.1',
                priv,
                avatar: `gravatar:${udoc.email || `${udoc.username}@universaloj.local`}`,
                bio: udoc.motto || '',
                gender: sexMap[udoc.sex] || 3,
                qq: udoc.qq.toString() || null,
                phone: udoc.cellphone || null,
            });
            if (udoc.usergroup === 'S') await UserModel.setSuperAdmin(uid);
            uidMap[udoc.username] = uid;
            await DomainModel.setUserInDomain(domainId, uid, {
                displayName: udoc.nickname || '',
                nAccept: udoc.ac_num,
            });
        }
    }
    report({ message: 'user finished' });

    /*
        CREATE TABLE `user_msg` (
        `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
        `sender` varchar(20) NOT NULL,
        `receiver` varchar(20) NOT NULL,
        `message` varchar(5000) NOT NULL,
        `send_time` datetime NOT NULL,
        `read_time` datetime DEFAULT NULL,
        PRIMARY KEY (`id`)
        ) ENGINE=MyISAM AUTO_INCREMENT=8299 DEFAULT CHARSET=utf8mb4;

        CREATE TABLE `user_system_msg` (
        `id` int(11) NOT NULL AUTO_INCREMENT,
        `title` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
        `content` varchar(300) COLLATE utf8mb4_unicode_ci NOT NULL,
        `receiver` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
        `send_time` datetime NOT NULL,
        `read_time` datetime DEFAULT NULL,
        PRIMARY KEY (`id`)
        ) ENGINE=InnoDB AUTO_INCREMENT=16814 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    */
    const messages = await query('SELECT * FROM `user_msg`');
    await Promise.all(messages.map((msg) => MessageModel.coll.insertOne({
        _id: Time.getObjectID(new Date(msg.send_time), false),
        from: uidMap[msg.sender],
        to: uidMap[msg.receiver],
        content: msg.message,
        flag: 0,
    })));
    const systemMessages = await query('SELECT * FROM `user_system_msg`');
    await Promise.all(systemMessages.map((msg) => MessageModel.coll.insertOne({
        _id: Time.getObjectID(new Date(msg.send_time), false),
        from: 1,
        to: uidMap[msg.receiver],
        content: msg.content,
        flag: 0,
    })));
    report({ message: 'message finished' });

    /*
        CREATE TABLE `problems` (
        `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
        `title` text NOT NULL,
        `is_hidden` tinyint(1) NOT NULL DEFAULT '0',
        `submission_requirement` text,
        `hackable` tinyint(1) NOT NULL DEFAULT '0',
        `extra_config` varchar(500) NOT NULL DEFAULT '{"view_content_type":"ALL_AFTER_AC","view_details_type":"SELF","view_all_details_type":"SELF"}',
        `zan` int(11) NOT NULL,
        `ac_num` int(11) NOT NULL DEFAULT '0',
        `submit_num` int(11) NOT NULL DEFAULT '0',
        `difficulty` int(11) NOT NULL DEFAULT '9999',
        PRIMARY KEY (`id`)
        ) ENGINE=MyISAM AUTO_INCREMENT=1545 DEFAULT CHARSET=utf8mb4;

        CREATE TABLE `problems_contents` (
        `id` int(11) NOT NULL,
        `statement` mediumtext NOT NULL,
        `statement_md` mediumtext NOT NULL,
        PRIMARY KEY (`id`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

        CREATE TABLE `problems_permissions` (
        `username` varchar(20) NOT NULL,
        `problem_id` int(11) NOT NULL,
        PRIMARY KEY (`username`,`problem_id`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

        CREATE TABLE `problems_tags` (
        `id` int(11) NOT NULL AUTO_INCREMENT,
        `problem_id` int(11) NOT NULL,
        `tag` varchar(30) NOT NULL,
        PRIMARY KEY (`id`),
        KEY `problem_id` (`problem_id`),
        KEY `tag` (`tag`)
        ) ENGINE=MyISAM AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4;
    */
    const pidMap: Record<string, number> = {};
    const [{ 'count(*)': pcount }] = await query('SELECT count(*) FROM `problems`');
    const step = 50;
    const pageCount = Math.ceil(Number(pcount) / step);
    for (let pageId = 0; pageId < pageCount; pageId++) {
        const pdocs = await query(`SELECT * FROM \`problems\` LIMIT ${pageId * step}, ${step}`);
        for (const pdoc of pdocs) {
            if (rerun) {
                const opdoc = await ProblemModel.get(domainId, `P${pdoc.id}`);
                if (opdoc) pidMap[pdoc.id] = opdoc.docId;
            }
            if (!pidMap[pdoc.id]) {
                const content = await query(`SELECT * FROM \`problems_contents\` WHERE \`id\` = ${pdoc.id}`);
                const pid = await ProblemModel.add(domainId, `P${pdoc.id}`, pdoc.title, content[0].statement_md || '', 1);
                pidMap[pdoc.id] = pid;
            }
            const [permissions, tags] = await Promise.all([
                query(`SELECT * FROM \`problems_permissions\` WHERE \`problem_id\` = ${pdoc.id}`),
                query(`SELECT * FROM \`problems_tags\` WHERE \`problem_id\` = ${pdoc.id}`),
            ]);
            const maintainer = permissions.map((p) => uidMap[p.username]).slice(1);
            await ProblemModel.edit(domainId, pidMap[pdoc.id], {
                nAccept: pdoc.ac_num || 0,
                nSubmit: pdoc.submit_num || 0,
                hidden: !!pdoc.is_hidden,
                tag: tags.map((t) => t.tag),
                owner: uidMap[permissions[0]?.username] || 1,
                maintainer,
            });
        }
        console.log({ message: `Synced ${pageId * step} / ${pcount} problems` });
    }
    report({ message: 'problem finished' });

    /*
        CREATE TABLE `contests` (
        `id` int(11) NOT NULL AUTO_INCREMENT,
        `name` varchar(50) NOT NULL,
        `start_time` datetime NOT NULL,
        `last_min` int(11) NOT NULL,
        `player_num` int(11) NOT NULL,
        `status` varchar(50) NOT NULL,
        `extra_config` varchar(200) NOT NULL,
        `zan` int(11) NOT NULL,
        PRIMARY KEY (`id`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

        CREATE TABLE `contests_asks` (
        `id` int(11) NOT NULL AUTO_INCREMENT,
        `contest_id` int(11) NOT NULL,
        `username` varchar(20) NOT NULL,
        `question` text NOT NULL,
        `answer` text NOT NULL,
        `post_time` datetime NOT NULL,
        `reply_time` datetime NOT NULL,
        `is_hidden` tinyint(1) DEFAULT '0',
        PRIMARY KEY (`id`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

        CREATE TABLE `contests_notice` (
        `contest_id` int(11) NOT NULL,
        `title` varchar(30) NOT NULL,
        `content` varchar(500) NOT NULL,
        `time` datetime NOT NULL,
        KEY `contest_id` (`contest_id`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

        CREATE TABLE `contests_permissions` (
        `username` varchar(20) NOT NULL,
        `contest_id` int(11) NOT NULL,
        PRIMARY KEY (`username`,`contest_id`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

        CREATE TABLE `contests_problems` (
        `problem_id` int(11) NOT NULL,
        `contest_id` int(11) NOT NULL,
        PRIMARY KEY (`problem_id`,`contest_id`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

        CREATE TABLE `contests_registrants` (
        `username` varchar(20) NOT NULL,
        `user_rating` int(11) NOT NULL,
        `contest_id` int(11) NOT NULL,
        `has_participated` tinyint(1) NOT NULL,
        `rank` int(11) NOT NULL,
        PRIMARY KEY (`contest_id`,`username`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

        CREATE TABLE `contests_submissions` (
        `contest_id` int(11) NOT NULL,
        `submitter` varchar(20) NOT NULL,
        `problem_id` int(11) NOT NULL,
        `submission_id` int(11) NOT NULL,
        `score` int(11) NOT NULL,
        `penalty` int(11) NOT NULL,
        PRIMARY KEY (`contest_id`,`submitter`,`problem_id`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;
    */

    const tidMap: Record<string, string> = {};
    const tdocs = await query('SELECT * FROM `contests`');
    for (const tdoc of tdocs) {
        const [permissions, problems, notices] = await Promise.all([
            query(`SELECT * FROM \`contests_permissions\` WHERE \`contest_id\` = ${tdoc.id}`),
            query(`SELECT * FROM \`contests_problems\` WHERE \`contest_id\` = ${tdoc.id} ORDER BY \`problem_id\` ASC`),
            // query(`SELECT * FROM \`contests_asks\` WHERE \`contest_id\` = ${tdoc.id}`),
            query(`SELECT * FROM \`contests_notice\` WHERE \`contest_id\` = ${tdoc.id}`),
        ]);
        let content = '';
        for (const notice of notices) {
            content += `## Notice: ${notice.title}\n${notice.content}\n${moment(notice.start_time).format('YYYY-MM-DD HH:mm:ss')}\n`;
        }
        const pids = problems.map((p) => pidMap[p.problem_id]);
        const maintainer = permissions.map((p) => uidMap[p.username]).slice(1);
        const info = JSON.parse(tdoc.extra_config || '{}');
        const startAt = moment(tdoc.start_time);
        const endAt = startAt.clone().add(tdoc.last_min, 'minutes');
        const tid = await ContestModel.add(
            domainId, tdoc.name, content, uidMap[permissions[0]?.username] || 1, info.contest_type?.toLowerCase() || 'oi',
            startAt.toDate(), endAt.toDate(), pids, !Object.keys(info).includes('unrated'), { maintainer },
        );
        tidMap[tdoc.id] = tid.toHexString();
    }
    report({ message: 'contest finished' });

    /*
        `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
        `problem_id` int(10) unsigned NOT NULL,
        `contest_id` int(10) unsigned DEFAULT NULL,
        `submit_time` datetime NOT NULL,
        `submitter` varchar(20) NOT NULL,
        `content` text NOT NULL,
        `language` varchar(15) NOT NULL,
        `tot_size` int(11) NOT NULL,
        `judge_time` datetime DEFAULT NULL,
        `result` blob NOT NULL,
        `status` varchar(20) NOT NULL,
        `result_error` varchar(20) DEFAULT NULL,
        `score` int(11) DEFAULT NULL,
        `used_time` int(11) NOT NULL DEFAULT '0',
        `used_memory` int(11) NOT NULL DEFAULT '0',
        `is_hidden` tinyint(1) NOT NULL,
        `status_details` varchar(100) NOT NULL,
        `contest_penalty` int(11) DEFAULT NULL,
    */
    if (dataDir.endsWith('/')) dataDir = dataDir.slice(0, -1);
    const [{ 'count(*)': rcount }] = await query('SELECT count(*) FROM `submissions`');
    const rpageCount = Math.ceil(Number(rcount) / step);
    for (let pageId = 0; pageId < rpageCount; pageId++) {
        const rdocs = await query(`SELECT * FROM \`submissions\` LIMIT ${pageId * step}, ${step}`);
        for (const rdoc of rdocs) {
            const data: RecordDoc = {
                status: statusMap[rdoc.result_error] || STATUS.STATUS_WAITING,
                _id: Time.getObjectID(new Date(rdoc.submit_time), false),
                uid: uidMap[rdoc.submitter] || 1,
                code: '',
                lang: langMap[rdoc.language] || '',
                pid: pidMap[rdoc.problem_id] || 0,
                domainId,
                score: rdoc.score || 0,
                time: rdoc.used_time || 0,
                memory: rdoc.used_memory || 0,
                judgeTexts: [],
                compilerTexts: [],
                testCases: [],
                judgeAt: new Date(rdoc.judge_time),
                rejudged: false,
                judger: 1,
            };
            const content = JSON.parse(rdoc.content);
            try {
                const zip = new Zip.ZipReader(
                    new Zip.BlobReader(new Blob([await fs.readFile(`${dataDir}/opt/uoj/web/app/storage${content.file_name}`)])),
                );
                let entries: Zip.Entry[];
                try {
                    entries = await zip.getEntries();
                } catch (e) {
                    throw new ValidationError('zip', null, e.message);
                }
                data.code = await entries.find((i) => i.filename.endsWith('answer.code'))?.getData(new Zip.TextWriter()) || '';
            } catch { /* ignore no code */ }
            const result = JSON.parse(Buffer.from(rdoc.result, 'base64').toString('utf8'));
            if (result.error) {
                if (data.status === STATUS.STATUS_COMPILE_ERROR) data.compilerTexts.push(result.error);
                else data.judgeTexts.push(result.error);
            } else {
                // TODO final_result
                if (!result.details) continue;
                try {
                    const details = await xml2js.parseStringPromise(result.details);
                    if (details.tests.subtask) {
                        for (const subtask of details.tests.subtask) {
                            if (!subtask.test) {
                                data.testCases.push({
                                    subtaskId: subtask.$.num,
                                    id: 1,
                                    score: 0,
                                    time: 0,
                                    memory: 0,
                                    message: 'Skipped',
                                    status: STATUS.STATUS_CANCELED,
                                });
                                continue;
                            }
                            data.testCases.push(...subtask.test.map((curCase, caseIndex) => ({
                                subtaskId: subtask.$.num,
                                id: caseIndex + 1,
                                score: curCase.$.score,
                                time: curCase.$.time === '-1' ? 0 : curCase.time,
                                memory: curCase.$.memory === '-1' ? 0 : curCase.memory,
                                message: curCase.res[0] || '',
                                status: statusMap[curCase.$.info] || STATUS.STATUS_WAITING,
                            })));
                        }
                    } else if (details.tests.test) {
                        data.testCases.push(...details.tests.test.map((curCase) => ({
                            subtaskId: 1,
                            id: curCase.$.num,
                            score: curCase.$.score,
                            time: curCase.$.time === '-1' ? 0 : curCase.time,
                            memory: curCase.$.memory === '-1' ? 0 : curCase.memory,
                            message: curCase.res[0] || '',
                            status: statusMap[curCase.$.info] || STATUS.STATUS_WAITING,
                        })));
                    }
                    data.status = Math.max(...data.testCases.map((x) => x.status));
                } catch (e) { console.log(rdoc.id, result); }
            }
            if (rdoc.contest_id) {
                data.contest = new ObjectId(tidMap[rdoc.contest_id]);
                await ContestModel.attend(domainId, data.contest, uidMap[rdoc.submitter]).catch(noop);
            }
            await RecordModel.coll.insertOne(data);
            await postJudge(data).catch((err) => report({ message: err.message }));
        }
        console.log({ message: `Synced ${pageId * step} / ${rcount} records` });
    }
    report({ message: 'record finished' });

    // TODO: blog

    src.end();

    const files = await fs.readdir(`${dataDir}/var/uoj_data/`, { withFileTypes: true });
    for (const file of files) {
        if (!file.isDirectory()) continue;
        const datas = await fs.readdir(`${dataDir}/var/uoj_data/${file.name}`, { withFileTypes: true });
        const pdoc = await ProblemModel.get(domainId, `P${file.name}`, undefined, true);
        if (!pdoc) continue;
        report({ message: `Syncing testdata for ${file.name}` });
        const filenames = datas.map((i) => i.name);
        for (const data of datas) {
            if (data.isDirectory()) continue;
            await ProblemModel.addTestdata(domainId, pdoc.docId, data.name, `${dataDir}/var/uoj_data/${file.name}/${data.name}`);
            if (data.name === 'problem.conf') {
                const confInfo: any = {
                    subtask_end: {},
                    subtask_score: {},
                    point: {},
                };
                const conf = await fs.readFile(`${dataDir}/var/uoj_data/${file.name}/${data.name}`, 'utf8');
                const config: ProblemConfigFile = {
                    subtasks: [],
                };
                const lines = conf.replace(/\r/g, '').split('\n').map((i) => i.trim()).filter((i) => i);
                for (const line of lines) {
                    const [key, value] = line.split(' ');
                    if (key === 'use_builtin_checker') {
                        config.checker = value;
                        config.checker_type = 'testlib';
                    } else if (key === 'time_limit') {
                        config.time = `${value}s`;
                    } else if (key === 'memory_limit') {
                        config.memory = `${value}mb`;
                    } else if (key.startsWith('subtask_end_')) {
                        confInfo.subtask_end[+key.slice(12)] = +value;
                    } else if (key.startsWith('subtask_score_')) {
                        confInfo.subtask_score[+key.slice(14)] = +value;
                    } else if (key.startsWith('point_score_')) {
                        confInfo.point[+key.slice(12)] = +value;
                    } else confInfo[key] = value;
                }
                if (!config.checker && filenames.includes('chk.cpp')) {
                    config.checker_type = 'testlib';
                    config.checker = 'chk.cpp';
                }
                if (filenames.includes('val.cpp')) config.validator = 'val.cpp';
                if (confInfo.n_tests && Object.keys(confInfo.point).length === +confInfo.n_tests) {
                    config.subtasks.push(...Object.keys(confInfo.point).map((i) => ({
                        id: +i,
                        score: confInfo.point[i],
                        cases: [{
                            input: `${confInfo.input_pre}${i}.${confInfo.input_suf}`,
                            output: `${confInfo.output_pre}${i}.${confInfo.output_suf}`,
                        }],
                    })));
                }
                if (confInfo.n_subtasks
                    && Object.keys(confInfo.subtask_end).length === +confInfo.n_subtasks
                    && Object.keys(confInfo.subtask_score).length === +confInfo.n_subtasks) {
                    config.subtasks.push(...[...Array.from({ length: +confInfo.n_subtasks })].map((v, i) => i + 1).map((i) => ({
                        id: +i,
                        score: confInfo.subtask_score[i],
                        cases: [...Array.from({ length: confInfo.subtask_end[i] - (confInfo.subtask_end[i - 1] || 0) })].map((v, j) => ({
                            input: `${confInfo.input_pre}${j + (confInfo.subtask_end[i - 1] || 0) + 1}.${confInfo.input_suf}`,
                            output: `${confInfo.output_pre}${j + (confInfo.subtask_end[i - 1] || 0) + 1}.${confInfo.output_suf}`,
                        })),
                    })));
                }
                if (+confInfo.n_ex_tests) {
                    if (!config.subtasks.length) {
                        config.subtasks.push({
                            id: 1,
                            score: 97,
                            type: 'sum' as SubtaskType,
                            cases: [...Array.from({ length: +confInfo.n_tests })].map((v, i) => i + 1).map((i) => ({
                                input: `${confInfo.input_pre}${i}.${confInfo.input_suf}`,
                                output: `${confInfo.output_pre}${i}.${confInfo.output_suf}`,
                            })),
                        });
                    }
                    config.subtasks.push({
                        id: Math.max(...config.subtasks.map((i) => i.id)) + 1,
                        score: 3,
                        cases: [...Array.from({ length: +confInfo.n_ex_tests })].map((v, i) => i + 1).map((i) => ({
                            input: `ex_${confInfo.input_pre}${i}.${confInfo.input_suf}`,
                            output: `ex_${confInfo.output_pre}${i}.${confInfo.output_suf}`,
                        })),
                    });
                }
                await ProblemModel.addTestdata(domainId, pdoc.docId, 'config.yaml', Buffer.from(yaml.dump(config)));
            }
        }
    }
    return true;
}
