/* eslint-disable no-await-in-loop */
/* eslint-disable style/no-tabs */

import path from 'path';
import zlib from 'zlib';
import mariadb from 'mariadb';
import {
    buildContent, ContestModel, DomainModel, fs, moment, noop, NotFoundError, ObjectId, postJudge, ProblemModel,
    RecordDoc, RecordModel, SolutionModel, STATUS, SystemModel, Time, UserModel,
} from 'hydrooj';

const statusMap = {
    0: STATUS.STATUS_ACCEPTED,
    1: STATUS.STATUS_WRONG_ANSWER,
    2: STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    3: STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    4: STATUS.STATUS_WRONG_ANSWER,
    5: STATUS.STATUS_RUNTIME_ERROR,
    6: STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
    7: STATUS.STATUS_COMPILE_ERROR,
};
const langMap = {
    0: 'cc',
    1: 'c',
    2: 'pas',
};
const nameMap: Record<string, string> = {
    'sample.in': 'sample0.in',
    'sample.out': 'sample0.out',
    'test.in': 'test0.in',
    'test.out': 'test0.out',
};

export async function run({
    host = 'localhost', port = 3306, name,
    username, password, domainId, contestType = 'oi',
    dataDir, imageDir, rerun = true, randomMail = false,
}, report: (data: any) => void) {
    const src = await mariadb.createConnection({
        host,
        port,
        user: username,
        password,
        database: name,
        // GBK
        charset: 'GBK',
    });
    const query = (q: string) => new Promise<any[]>((res, rej) => {
        src.query(q).then((r) => res(r)).catch((e) => rej(e));
    });
    const target = await DomainModel.get(domainId);
    if (!target) throw new NotFoundError(domainId);
    report({ message: 'Connected to database' });
    /*
        user_id     varchar 20	N	用户id（主键）
        email       varchar 100	Y	用户E-mail
        submit      int     11	Y	用户提交次数
        solved      int     11	Y	成功次数
        defunct     char    1	N	是否屏蔽（Y/N）
        ip          varchar 20	N	用户注册ip
        accesstime	datetime	Y	用户注册时间
        volume      int     11	N	页码（表示用户上次看到第几页）
        language    int     11	N	语言
        password    varchar	32	Y	密码（加密）
        reg_time    datetime	Y	用户注册时间
        nick        varchar	100	N	昵称
        school      varchar	100	N	用户所在学校
    */
    const uidMap: Record<string, number> = {};
    const udocs = await query('SELECT *, DECODE(`password`, "PWDforJO2005") as `depass` FROM `users`');
    const precheck = await UserModel.getMulti({ unameLower: { $in: udocs.map((u) => u.user_id.toLowerCase()) } }).toArray();
    if (precheck.length) throw new Error(`Conflict username: ${precheck.map((u) => u.unameLower).join(', ')}`);
    for (const udoc of udocs) {
        if (randomMail) delete udoc.email;
        let current = await UserModel.getByEmail(domainId, udoc.email || `${udoc.user_id}@poj.local`);
        current ||= await UserModel.getByUname(domainId, udoc.user_id);
        if (current) {
            report({ message: `duplicate user with email ${udoc.email}: ${current.uname},${udoc.user_id}` });
            uidMap[udoc.user_id] = current._id;
        } else {
            const uid = await UserModel.create(
                udoc.email || `${udoc.user_id}@poj.local`, udoc.user_id, '',
                null, udoc.ip, udoc.defunct === 'Y' ? 0 : SystemModel.get('default.priv'),
            );
            uidMap[udoc.user_id] = uid;
            await UserModel.setById(uid, {
                loginat: udoc.accesstime,
                regat: udoc.reg_time,
                school: udoc.school || '',
            });
            await UserModel.setPassword(uid, udoc.depass);
            await DomainModel.setUserInDomain(domainId, uid, {
                displayName: udoc.nick || '',
                school: udoc.school || '',
                nSubmit: udoc.submit,
                nAccept: 0,
            });
        }
    }

    const admins = await query("SELECT * FROM `privilege` WHERE `rightstr` = 'administrator'");
    for (const admin of admins) await DomainModel.setUserRole(domainId, uidMap[admin.user_id], 'root');
    const adminUids = admins.map((admin) => uidMap[admin.user_id]);
    report({ message: 'user finished' });

    /*
        problem_id	int	11	N	题目编号，主键
        title	varchar	200	N	标题
        description	text		Y	题目描述
        inupt	text		Y	输入说明
        output	text		Y	输出说明
        input_path
        output_path
        sample_input	text		Y	输入参照
        sample_output	text		Y	输出参照
        sample_Program
        hint	text		Y	暗示
        source	varchar	100	Y	来源
        in_date	datetime		Y	加入时间
        time_limit	int	11	N	限时（ms）
        memory_limit	int	11	N	空间限制(k)
        defunct	char	1	N	是否屏蔽（Y/N）
        contest_id  #ingore
        accepted	int	11	Y	总ac次数
        submit	int	11	Y	总提交次数
        ratio
        error
        difficulty
        submit_user
        solved	int	11	Y	解答（未用）
        case_time_limit #ingore
    */
    const pidMap: Record<string, number> = {};
    const [{ 'count(*)': pcount }] = await query('SELECT count(*) FROM `problem`');
    const step = 50;
    const pageCount = Math.ceil(Number(pcount) / step);
    for (let pageId = 0; pageId < pageCount; pageId++) {
        const pdocs = await query(`SELECT * FROM \`problem\` LIMIT ${pageId * step}, ${step}`);
        for (const pdoc of pdocs) {
            if (rerun) {
                const opdoc = await ProblemModel.get(domainId, `P${pdoc.problem_id}`);
                if (opdoc) pidMap[pdoc.problem_id] = opdoc.docId;
            }
            if (!pidMap[pdoc.problem_id]) {
                const files = {};
                let content = buildContent({
                    description: pdoc.description,
                    input: pdoc.input,
                    output: pdoc.output,
                    samples: [[pdoc.sample_input.trim(), pdoc.sample_output.trim()]],
                    hint: pdoc.hint,
                    source: pdoc.source,
                }, 'html');
                // eslint-disable-next-line regexp/no-super-linear-backtracking
                const uploadFiles = content.matchAll(/(?:src|href)="\/images\/([^"]+\/([^"]+))"/g);
                for (const file of uploadFiles) {
                    try {
                        files[file[2]] = await fs.readFile(path.join(imageDir, file[1]));
                        content = content.replace(`images/${file[1]}`, `file://${file[2]}`);
                    } catch (e) {
                        report({ message: `failed to read file: ${path.join(imageDir, file[1])}` });
                    }
                }
                const pid = await ProblemModel.add(
                    domainId, `P${pdoc.problem_id}`,
                    pdoc.title, content,
                    1, pdoc.source?.trim().length ? pdoc.source.split(' ').map((i) => i.trim()).filter((i) => i) : [],
                    { hidden: pdoc.defunct === 'Y' },
                );
                pidMap[pdoc.problem_id] = pid;
                await Promise.all(Object.keys(files).map((filename) => ProblemModel.addAdditionalFile(domainId, pid, filename, files[filename])));
                if (Object.keys(files).length) report({ message: `move ${Object.keys(files).length} file for problem ${pid}` });
            }
            await ProblemModel.edit(domainId, pidMap[pdoc.problem_id], {
                nAccept: 0,
                nSubmit: pdoc.submit,
                config: `time: ${pdoc.time_limit}ms
memory: ${pdoc.memory_limit}k`,
                owner: 1,
                html: true,
            });
            if (pdoc.sample_Program) {
                await SolutionModel.add(domainId, pidMap[pdoc.problem_id], 1, pdoc.sample_Program);
            }
        }
    }
    report({ message: 'problem finished' });

    /*
        contest_id	int	11	N	竞赛id（主键）
        title	varchar	255	Y	竞赛标题
        start_time	datetime		Y	开始时间(年月日时分)
        end_time	datatime		Y	结束时间(年月日时分)
        defunct	char	1	N	是否屏蔽（Y/N）
        description	text		Y	描述（在此版本中未用）
        private	tinyint	4		公开/内部（0/1）
    */
    const tidMap: Record<string, string> = {};
    const tdocs = await query('SELECT * FROM `contest`');
    for (const tdoc of tdocs) {
        const pdocs = await query(`SELECT * FROM \`contest_problem\` WHERE \`contest_id\` = ${tdoc.contest_id} ORDER BY \`num\` ASC`);
        const pids = pdocs.map((i) => pidMap[i.problem_id]).filter((i) => i);
        const endAt = moment(tdoc.end_time).isSameOrBefore(tdoc.start_time) ? moment(tdoc.end_time).add(1, 'minute').toDate() : tdoc.end_time;
        const tid = await ContestModel.add(
            domainId, tdoc.title, tdoc.description || 'Description',
            adminUids[0], contestType, tdoc.start_time, endAt, pids, true,
            tdoc.private ? { _code: password } : {},
        );
        tidMap[tdoc.contest_id] = tid.toHexString();
    }
    report({ message: 'contest finished' });
    /*
        solution	程序运行结果记录
        字段名	类型	长度	是否允许为空	备注
        solution_id	int	11	N	运行id（主键）
        problem_id	int	11	N	问题id
        user_id	char	20	N	用户id
        time	int	11	N	用时（秒）
        memory	int	11	N	所用空间（）
        className
        in_date	datetime		N	加入时间
        result	smallint	6	N	结果（0：AC）
        language	tinyint	4	N	语言
        ip	char	15	N	用户ip
        contest_id	int	11	Y	所属于竞赛组
        valid	tinyint	4	N	是否有效？？？
        num	tinyint	4	N	题目在竞赛中的顺序号
        code_length	int	11	N	代码长度
    */
    const [{ 'count(*)': rcount }] = await query('SELECT count(*) FROM `solution`');
    const rpageCount = Math.ceil(Number(rcount) / step);
    for (let pageId = 0; pageId < rpageCount; pageId++) {
        const rdocs = await query(`SELECT * FROM \`solution\` LIMIT ${pageId * step}, ${step}`);
        for (const rdoc of rdocs) {
            const data: RecordDoc = {
                status: statusMap[rdoc.result] || 0,
                _id: Time.getObjectID(rdoc.in_date, false),
                uid: uidMap[rdoc.user_id] || 0,
                code: "POJ didn't provide user code",
                lang: langMap[rdoc.language || 0],
                pid: pidMap[rdoc.problem_id] || 0,
                domainId,
                score: rdoc.result === 0 ? 100 : 0,
                time: rdoc.time || 0,
                memory: rdoc.memory || 0,
                judgeTexts: [],
                compilerTexts: [],
                testCases: [],
                judgeAt: new Date(),
                rejudged: false,
                judger: 1,
            };
            const ceInfo = await query(`SELECT \`error\` FROM \`compileinfo\` WHERE \`solution_id\` = ${rdoc.solution_id}`);
            if (ceInfo[0]?.error) data.judgeTexts.push(ceInfo[0].error);
            const source = await query(`SELECT \`source\` FROM \`source_code\` WHERE \`solution_id\` = ${rdoc.solution_id}`);
            // decompress mysql buffer, slice 4 then it can start at 78 9c (zlib header)
            if (source[0]?.source) data.code = zlib.inflateSync(source[0].source.slice(4)).toString('utf-8');
            if (rdoc.contest_id) {
                data.contest = new ObjectId(tidMap[rdoc.contest_id]);
                await ContestModel.attend(domainId, data.contest, uidMap[rdoc.user_id]).catch(noop);
            }
            await RecordModel.coll.insertOne(data);
            await postJudge(data).catch((err) => report({ message: err.message }));
        }
    }
    report({ message: 'record finished' });

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
            const filename = nameMap[data.name] || data.name;
            const originalFile = fs.readFileSync(`${dataDir}/${file.name}/${data.name}`).toString();
            await ProblemModel.addTestdata(domainId, pdoc.docId, filename, originalFile.replace(/\r\n/g, '\n'));
        }
        await ProblemModel.addTestdata(domainId, pdoc.docId, 'config.yaml', Buffer.from(pdoc.config as string));
    }
    return true;
}
