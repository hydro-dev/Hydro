/* eslint-disable no-tabs */
/* eslint-disable no-await-in-loop */
import mysql from 'mysql';
import { buildContent } from 'hydrooj/src/lib/content';
import problem from 'hydrooj/src/model/problem';
import * as system from 'hydrooj/src/model/system';
import user from 'hydrooj/src/model/user';

export async function run({
    host = 'localhost', port = 27017, name = 'vijos4', username, password,
}, report: Function) {
    const src = mysql.createConnection({
        host,
        port,
        user: username,
        password,
        database: name,
    });
    await new Promise((resolve) => src.connect(resolve));
    const query = (q: string | mysql.Query): Promise<[values: any[], fields: mysql.FieldInfo[]]> => new Promise((res, rej) => {
        src.query(q, (err, val, fields) => {
            if (err) rej(err);
            else res([val, fields]);
        });
    });
    report({ message: 'Connected to database' });
    /*
        user_id     varchar	20	N	用户id（主键）
        email       varchar	100	Y	用户E-mail
        submit      int	    11	Y	用户提交次数
        solved      int	    11	Y	成功次数
        defunct     char	1	N	是否屏蔽（Y/N）
        ip          varchar	20	N	用户注册ip
        accesstime	datetime	Y	用户注册时间
        volume      int     11	N	页码（表示用户上次看到第几页）
        language    int     11	N	语言
        password    varchar	32	Y	密码（加密）
        reg_time    datetime		Y	用户注册时间
        nick        varchar	100	N	昵称
        school      varchar	100	N	用户所在学校
    */
    const uidMap: Record<string, number> = {};

    const [udocs] = await query('SELECT * FROM `users`');
    for (const udoc of udocs) {
        const uid = await user.create(udoc.email, udoc.nick, '', null, udoc.ip, udoc.defunct === 'Y' ? 0 : system.get('default.priv'));
        uidMap[udoc.uid] = uid;
        await user.setById(uid, {
            nSubmit: udoc.submit,
            nSolve: udoc.solved,
            loginat: udoc.accesstime,
            regat: udoc.reg_time,
            hash: udoc.password,
            salt: udoc.password,
            hashType: 'hust',
        });
    }

    const [admins] = await query("SELECT * FROM 'privilege' WHERE rightstr = 'administrator'");
    for (const admin of admins) await user.setSuperAdmin(uidMap[admin.user_id]);

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
    const [[pcount]] = await query('SELECT count(*) FROM `problem`');
    const step = 50;
    const pageCount = Math.ceil(pcount / step);
    for (let pageId = 0; pageId < pageCount; pageId++) {
        const [pdocs] = await query(`SELECT * FROM \`problem\` LIMIT ${pageId * step}, ${step}`);
        for (const pdoc of pdocs) {
            const pid = await problem.add(
                'system', `P${pdoc.problem_id}`,
                pdoc.title, buildContent({
                    description: pdoc.description,
                    input: pdoc.input,
                    output: pdoc.output,
                    samples: [[pdoc.sample_input, pdoc.sample_output]],
                    hint: pdoc.hint,
                    source: pdoc.source,
                }),
                1, pdoc.source.split(' '), pdoc.defunct === 'Y',
            );
            const [cdoc] = await query(`SELECT * FROM 'privilege' WHERE rightstr = 'p${pdoc.problem_id}'`);
            await problem.edit('system', pid, {
                nAccept: pdoc.accepted,
                nSubmit: pdoc.submit,
                config: `time: ${pdoc.time_limit}s\nmemory: ${pdoc.memory_limit}m`,
                owner: uidMap[cdoc[0].user_id],
            });
        }
    }
    return true;
}

export const description = 'migrate from hustoj';
export const validate = {
    host: 'string', port: 'number', name: 'string', username: 'string', password: 'string',
};

global.Hydro.script.migrateHustoj = { run, description, validate };
