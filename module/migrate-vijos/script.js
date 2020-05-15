/* eslint-disable no-await-in-loop */
const { mongodb, bson } = global.Hydro.nodeModules;
const dst = global.Hydro.service.db;
const { problem } = global.Hydro.model.problem;

const tasks = {
    user: async (docs) => docs.map((doc) => ({
        _id: doc._id,
        uname: doc.uname,
        unameLower: doc.uname_lower,
        salt: doc.salt,
        hash: doc.hash.split('|')[1],
        hashType: doc.hash.split('|')[0] === 'vj4' ? 'hydro' : doc.hash.split('|')[0],
        gravatar: doc.gravatar,
        email: doc.mail,
        emailLower: doc.mail_lower,
        regat: doc.regat,
        regip: doc.regip,
        loginat: doc.loginat,
        loginip: doc.loginip,
        codeLang: doc.code_lang,
        codeTemplate: doc.code_template,
        timezone: doc.timezone,
        viewLang: doc.viewLang,
        bio: doc.bio,
        gender: doc.gender,
        qq: doc.qq,
    })),
    problem: async (docs) => docs.map((doc) => ({
        _id: doc._id,
        pid: doc.pname || doc.doc_id.toString() || new bson.ObjectID(),
        title: doc.title,
        content: doc.content,
        owner: doc.owner_uid,
        data: doc.data,
        category: doc.category,
        tag: doc.tag,
        nSubmit: doc.num_submit,
        nAccept: doc.num_accept,
    })),
    'problem.status': async (docs) => {
        const problems = [];
        for (const doc of docs) {
            problems.push({
                pid: await problem.get(doc.pid),
                rid: doc.rid,
                uid: doc.uid,
                status: doc.status,
            });
        }
        return problems;
    },
    solution: async (docs) => {
        const solutions = [];
        for (const doc of docs) {
            const reply = doc.reply.map((r) => ({
                owner: r.owner_uid,
                content: r.content,
                _id: r._id,
            }));
            const pdoc = await problem.get(doc.parent_doc_id.toString());
            solutions.push({
                _id: doc._id,
                owner: doc.owner_uid,
                content: doc.content,
                vote: doc.vote,
                reply,
                pid: pdoc._id,
            });
        }
        return solutions;
    },
    discussion: async (docs) => {
        const TYPE = {
            10: 'problem',
            20: 'node',
            30: 'contest',
        };
        const discussions = [];
        for (const doc of docs) {
            discussions.push({
                _id: doc._id,
                title: doc.title,
                content: doc.content,
                owner: doc.owner_uid,
                views: doc.views,
                highlight: doc.highlight,
                nReply: doc.num_replies,
                ip: doc.ip,
                updateAt: doc.update_at,
                parentType: TYPE[doc.parentType],
                parentId: doc.parentId,
            });
        }
        return discussions;
    },
    'discussion.reply': async (docs) => docs.map((doc) => ({
        _id: doc._id,
        owner: doc.owner_uid,
        ip: doc.ip,
        content: doc.content,
        parentId: doc.parent_doc_id,
    })),
    contest: async (docs) => {
        const RULES = ['oi', 'acm', 'homework'];
        const contests = [];
        for (const doc of docs) {
            const pids = [];
            for (const pid of doc.pids) {
                const pdoc = await problem.get(pid.toString());
                pids.push(pdoc._id);
            }
            contests.push({
                _id: doc._id,
                title: doc.title,
                content: doc.content,
                owner: doc.owner_uid,
                rule: RULES[doc.rule],
                beginAt: doc.begin_at,
                endAt: doc.end_at,
                pids,
                attend: doc.attend,
            });
        }
        return contests;
    },
    training: async (docs) => {
        const trainings = [];
        for (const doc of docs) {
            const dag = [];
            for (const t of doc.dag) {
                const pids = [];
                for (const pid of t.pids) {
                    const pdoc = await problem.get(pid.toString());
                    pids.push(pdoc._id);
                }
                dag.push({
                    _id: t._id,
                    title: t.title,
                    requireNids: t.require_nids,
                    pids,
                });
            }
            trainings.push({
                _id: doc._id,
                title: doc.title,
                content: doc.content,
                description: doc.desc,
                enroll: doc.enroll,
                owner: doc.owner_uid,
                dag,
            });
        }
        return trainings;
    },
};

const cursor = {
    user: (s) => s.collection('user').find(),
    problem: (s) => s.collection('document').find({ doc_type: 10 }),
    'problem.status': (s) => s.collection('document.status').find({ doc_type: 10 }),
    solution: (s) => s.collection('document').find({ doc_type: 11 }),
    discussion: (s) => s.collection('document').find({ doc_type: 21 }),
    'discussion.reply': (s) => s.collection('document').find({ doc_type: 22 }),
    contest: (s) => s.collection('document').find({ doc_type: 30 }),
    training: (s) => s.collection('document').find({ doc_type: 40 }),
};

async function task(name, src, report) {
    const count = await cursor[name](src).count();
    await report({ progress: 1, message: `${name}: ${count}` });
    const total = Math.floor(count / 50);
    for (let i = 0; i <= total; i++) {
        const docs = await cursor[name](src).skip(i * 50).limit(50).toArray();
        await dst.collection(name).insertMany(await tasks[name](docs));
        await report({ progress: Math.round(100 * (i / total)) });
    }
}

async function migrateVijos({
    host, port, name, username, password,
}, report = () => { }) {
    let mongourl = 'mongodb://';
    if (username) mongourl += `${username}:${password}@`;
    mongourl += `${host}:${port}/${name}`;
    const Database = await mongodb.MongoClient.connect(mongourl, {
        useNewUrlParser: true, useUnifiedTopology: true,
    });
    const src = Database.db(name);
    await report({ progress: 0, message: 'Database connected.' });
    await dst.collection('system').insertOne({
        _id: 'user',
        value: (await src.collection('system').findOne({ _id: 'user_counter' })).value,
    });
    await report({ progress: 1, message: 'Collection:system done.' });
    const t = [
        'user', 'problem', 'problem.status', 'solution', 'discussion',
        'discussion.reply', 'contest', 'training',
    ];
    for (const i of t) await task(i, src, report);
}

global.Hydro.script.migrateVijos = module.exports = migrateVijos;
