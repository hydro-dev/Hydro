/* eslint-disable no-tabs */
/* eslint-disable no-await-in-loop */
import fs from 'fs-extra';
import { ObjectID } from 'mongodb';
import mysql from 'mysql';
import { STATUS } from '@hydrooj/utils/lib/status';
import { noop, Time } from '@hydrooj/utils/lib/utils';
import { NotFoundError } from 'hydrooj/src/error';
import { postJudge } from 'hydrooj/src/handler/judge';
import { RecordDoc } from 'hydrooj/src/interface';
import { buildContent } from 'hydrooj/src/lib/content';
import * as contest from 'hydrooj/src/model/contest';
import domain from 'hydrooj/src/model/domain';
import problem from 'hydrooj/src/model/problem';
import record from 'hydrooj/src/model/record';
import * as system from 'hydrooj/src/model/system';
import user from 'hydrooj/src/model/user';

const statusMap = {
    4: STATUS.STATUS_ACCEPTED,
    5: STATUS.STATUS_WRONG_ANSWER,
    6: STATUS.STATUS_WRONG_ANSWER,
    7: STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    8: STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    9: STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
    10: STATUS.STATUS_RUNTIME_ERROR,
    11: STATUS.STATUS_COMPILE_ERROR,
};
const langMap = {
    0: 'c',
    1: 'cc',
    2: 'pas',
    3: 'java',
    4: 'rb',
    5: 'bash',
    6: 'py',
    7: 'php',
    8: 'perl',
    9: 'cs',
    10: 'oc',
    11: 'fb',
    12: 'sc',
    13: 'cl',
    14: 'cl++',
    15: 'lua',
    16: 'js',
    17: 'go',
};
const nameMap = {
    'sample.in': 'sample0.in',
    'sample.out': 'sample0.out',
    'test.in': 'test0.in',
    'test.out': 'test0.out',
};

export async function run({
    host = 'localhost', port = 3306, name = 'jol',
    username, password, domainId, contestType = 'oi',
    dataDir,
}, report: Function) {
    const src = mysql.createConnection({
        host,
        port,
        user: username,
        password,
        database: name,
    });
    await new Promise((resolve, reject) => src.connect((err) => (err ? reject(err) : resolve(null))));
    const query = (q: string | mysql.Query) => new Promise<[values: any[], fields: mysql.FieldInfo[]]>((res, rej) => {
        src.query(q, (err, val, fields) => {
            if (err) rej(err);
            else res([val, fields]);
        });
    });
    const target = await domain.get(domainId);
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
    const [udocs] = await query('SELECT * FROM `users`');
    const precheck = await user.getMulti({ unameLower: { $in: udocs.map((u) => u.user_id.toLowerCase()) } }).toArray();
    if (precheck.length) throw new Error(`Conflict username: ${precheck.map((u) => u.unameLower).join(', ')}`);
    for (const udoc of udocs) {
        const current = await user.getByEmail(domainId, udoc.email || `${udoc.user_id}@hustoj.local`);
        if (current) {
            report({ message: `duplicate user with email ${udoc.email}: ${current.uname},${udoc.user_id}` });
            uidMap[udoc.user_id] = current._id;
        } else {
            const uid = await user.create(
                udoc.email || `${udoc.user_id}@hustoj.local`, udoc.user_id, '',
                null, udoc.ip, udoc.defunct === 'Y' ? 0 : system.get('default.priv'),
            );
            uidMap[udoc.user_id] = uid;
            await user.setById(uid, {
                loginat: udoc.accesstime,
                regat: udoc.reg_time,
                hash: udoc.password,
                salt: udoc.password,
                hashType: 'hust',
            });
            await domain.setUserInDomain(domainId, uid, {
                displayName: udoc.nick || '',
                school: udoc.school || '',
                nSubmit: udoc.submit,
                nAccept: 0,
            });
        }
    }

    const [admins] = await query("SELECT * FROM `privilege` WHERE `rightstr` = 'administrator'");
    for (const admin of admins) await domain.setUserRole(domainId, uidMap[admin.user_id], 'root');
    const adminUids = admins.map((admin) => uidMap[admin.user_id]);

    /*
        problem_id	int	11	N	题目编号，主键
        title	varchar	200	N	标题
        description	text		Y	题目描述
        inupt	text		Y	输入说明
        output	text		Y	输出说明
        sample_input	text		Y	输入参照
        sample_output	text		Y	输出参照
        spj	char	1	N	是否为特别题目
        hint	text		Y	暗示
        source	varchar	100	Y	来源
        in_date	datetime		Y	加入时间
        time_limit	int	11	N	限时（秒）
        memory_limit	int	11	N	空间限制(MByte)
        defunct	char	1	N	是否屏蔽（Y/N）
        accepted	int	11	Y	总ac次数
        submit	int	11	Y	总提交次数
        solved	int	11	Y	解答（未用）
    */
    const pidMap: Record<string, number> = {};
    const [[{ 'count(*)': pcount }]] = await query('SELECT count(*) FROM `problem`');
    const step = 50;
    const pageCount = Math.ceil(pcount / step);
    for (let pageId = 0; pageId < pageCount; pageId++) {
        const [pdocs] = await query(`SELECT * FROM \`problem\` LIMIT ${pageId * step}, ${step}`);
        for (const pdoc of pdocs) {
            const pid = await problem.add(
                domainId, `P${pdoc.problem_id}`,
                pdoc.title, buildContent({
                    description: pdoc.description,
                    input: pdoc.input,
                    output: pdoc.output,
                    samples: [[pdoc.sample_input.trim(), pdoc.sample_output.trim()]],
                    hint: pdoc.hint,
                    source: pdoc.source,
                }, 'html'),
                1, pdoc.source.split(' ').map((i) => i.trim()).filter((i) => i), pdoc.defunct === 'Y',
            );
            pidMap[pdoc.problem_id] = pid;
            const [cdoc] = await query(`SELECT * FROM \`privilege\` WHERE \`rightstr\` = 'p${pdoc.problem_id}'`);
            const maintainer = [];
            for (let i = 1; i < cdoc.length; i++) maintainer.push(uidMap[cdoc[i].user_id]);
            await problem.edit(domainId, pid, {
                nAccept: 0,
                nSubmit: pdoc.submit,
                config: `time: ${pdoc.time_limit}s\nmemory: ${pdoc.memory_limit}m`,
                owner: uidMap[cdoc[0]?.user_id] || 1,
                maintainer,
                html: true,
            });
        }
    }

    /*
        contest_id	int	11	N	竞赛id（主键）
        title	varchar	255	Y	竞赛标题
        start_time	datetime		Y	开始时间(年月日时分)
        end_time	datatime		Y	结束时间(年月日时分)
        defunct	char	1	N	是否屏蔽（Y/N）
        description	text		Y	描述（在此版本中未用）
        private	tinyint	4		公开/内部（0/1）
        langmask	int	11		语言
        password	char(16)			进入比赛的密码
        user_id	char(48)			允许参加比赛用户列表
    */
    const tidMap: Record<string, string> = {};
    const [tdocs] = await query('SELECT * FROM `contest`');
    for (const tdoc of tdocs) {
        const [pdocs] = await query(`SELECT * FROM \`contest_problem\` WHERE \`contest_id\` = ${tdoc.contest_id}`);
        const pids = pdocs.map((i) => pidMap[i.problem_id]);
        const tid = await contest.add(
            domainId, tdoc.title, tdoc.description || 'Description',
            adminUids[0], contestType, tdoc.start_time, tdoc.end_time, pids, true,
            { _code: password },
        );
        tidMap[tdoc.contest_id] = tid.toHexString();
    }

    /*
        solution	程序运行结果记录
        字段名	类型	长度	是否允许为空	备注
        solution_id	int	11	N	运行id（主键）
        problem_id	int	11	N	问题id
        user_id	char	20	N	用户id
        time	int	11	N	用时（秒）
        memory	int	11	N	所用空间（）
        in_date	datetime		N	加入时间
        result	smallint	6	N	结果（4：AC）
        language	tinyint	4	N	语言
        ip	char	15	N	用户ip
        contest_id	int	11	Y	所属于竞赛组
        valid	tinyint	4	N	是否有效？？？
        num	tinyint	4	N	题目在竞赛中的顺序号
        code_lenght	int	11	N	代码长度
        judgetime	datetime		Y	判题时间
        pass_rate	decimal	2	N	通过百分比（OI模式下可用）
        lint_error	int		N	？？？
        judger	char(16)		N	判题机
    */
    const [[{ 'count(*)': rcount }]] = await query('SELECT count(*) FROM `solution`');
    const rpageCount = Math.ceil(rcount / step);
    for (let pageId = 0; pageId < rpageCount; pageId++) {
        const [rdocs] = await query(`SELECT * FROM \`solution\` LIMIT ${pageId * step}, ${step}`);
        for (const rdoc of rdocs) {
            const data: RecordDoc = {
                status: statusMap[rdoc.result],
                _id: Time.getObjectID(rdoc.in_date, false),
                uid: uidMap[rdoc.user_id],
                code: "HustOJ didn't provide user code",
                lang: langMap[rdoc.language],
                pid: pidMap[rdoc.problem_id],
                domainId,
                score: rdoc.pass_rate ? Math.ceil(rdoc.pass_rate * 100) : rdoc.result === 4 ? 100 : 0,
                time: rdoc.time,
                memory: rdoc.memory,
                judgeTexts: [],
                compilerTexts: [],
                testCases: [],
                judgeAt: new Date(),
                rejudged: false,
                judger: 1,
            };
            const [ceInfo] = await query(`SELECT \`error\` FROM \`compileinfo\` WHERE \`solution_id\` = ${rdoc.solution_id}`);
            if (ceInfo[0]?.error) data.judgeTexts.push(ceInfo[0].error);
            const [rtInfo] = await query(`SELECT \`error\` FROM \`runtimeinfo\` WHERE \`solution_id\` = ${rdoc.solution_id}`);
            if (rtInfo[0]?.error) data.judgeTexts.push(rtInfo[0].error);
            const [source] = await query(`SELECT \`source\` FROM \`source_code\` WHERE \`solution_id\` = ${rdoc.solution_id}`);
            if (source[0]?.source) data.code = source[0].source;
            if (rdoc.contest_id) {
                data.contest = new ObjectID(tidMap[rdoc.contest_id]);
                await contest.attend(domainId, data.contest, uidMap[rdoc.user_id]).catch(noop);
            }
            await record.coll.insertOne(data);
            await postJudge(data);
        }
    }

    src.end();

    if (dataDir.endsWith('/')) dataDir = dataDir.slice(0, -1);
    const files = await fs.readdir(dataDir, { withFileTypes: true });
    for (const file of files) {
        if (!file.isDirectory()) continue;
        const datas = await fs.readdir(`${dataDir}/${file.name}`);
        const pdoc = await problem.get(domainId, `P${file.name}`, undefined, true);
        if (!pdoc) continue;
        report({ message: `Syncing testdata for ${file.name}` });
        for (const data of datas) {
            const filename = nameMap[data] || data;
            await problem.addTestdata(domainId, pdoc.docId, filename, `${dataDir}/${file.name}/${data}`);
        }
        await problem.addTestdata(domainId, pdoc.docId, 'config.yaml', Buffer.from(pdoc.config as string));
    }
    return true;
}

export const description = 'migrate from hustoj';
export const validate = {
    host: 'string',
    port: 'number',
    name: 'string',
    username: 'string',
    password: 'string',
    domainId: 'string',
    contestType: 'string',
    dataDir: 'string',
};

global.Hydro.script.migrateHustoj = { run, description, validate };
