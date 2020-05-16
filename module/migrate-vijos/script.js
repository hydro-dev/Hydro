/* eslint-disable no-await-in-loop */
const { mongodb } = global.Hydro.nodeModules;
const dst = global.Hydro.service.db;
const { problem } = global.Hydro.model;

const map = {};

const pid = (id) => {
    if (map[id.toString()]) return map[id.toString()];
    if (id.generationTime) return id;
    id = id.toString();
    return id;
};

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
    problem: async (docs) => {
        const problems = [];
        for (const doc of docs) {
            if (doc.pname) map[doc.doc_id.toString()] = doc.pname;
            problems.push({
                _id: doc._id,
                pid: doc.pname || pid(doc.doc_id),
                title: doc.title,
                content: doc.content,
                owner: doc.owner_uid,
                data: doc.data,
                category: doc.category,
                tag: doc.tag,
                nSubmit: doc.num_submit,
                nAccept: doc.num_accept,
                hidden: doc.hidden || false,
            });
        }
        return problems;
    },
    'problem.status': async (docs) => {
        const problems = [];
        for (const doc of docs) {
            try {
                problems.push({
                    pid: await problem.get(pid(doc.doc_id)),
                    rid: doc.rid,
                    uid: doc.uid,
                    status: doc.status,
                });
            } catch (e) {
                // Ignore
            }
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
            const pdoc = await problem.get(pid(doc.parent_doc_id));
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
        const RULES = {
            2: 'oi',
            3: 'acm',
            11: 'homework',
        };
        const contests = [];
        for (const doc of docs) {
            const pids = [];
            for (const p of doc.pids) {
                const pdoc = await problem.get(pid(p));
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
                for (const p of t.pids) {
                    const pdoc = await problem.get(pid(p));
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
    'fs.files': async (docs) => docs,
    'fs.chunks': async (docs) => docs,
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
    'fs.files': (s) => s.collection('fs.files').find(),
    'fs.chunks': (s) => s.collection('fs.chunks').find(),
};

async function task(name, src, report) {
    const count = await cursor[name](src).count();
    await report({ progress: 1, message: `${name}: ${count}` });
    const total = Math.floor(count / 50);
    for (let i = 0; i <= total; i++) {
        const docs = await cursor[name](src).skip(i * 50).limit(50).toArray();
        const t = await tasks[name](docs);
        if (t.length) await dst.collection(name).insertMany(t);
        await report({ progress: Math.round(100 * ((i + 1) / (total + 1))) });
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
    await dst.collection('system').updateOne(
        { _id: 'user' },
        {
            $set: {
                value: (await src.collection('system').findOne({ _id: 'user_counter' })).value,
            },
        },
        { upsert: true },
    );
    await report({ progress: 1, message: 'Collection:system done.' });
    await dst.collection('user').deleteMany({ _id: { $nin: [0, 1] } });
    const d = [
        'problem', 'problem.status', 'solution', 'discussion',
        'discussion.reply', 'contest', 'training', 'fs.files', 'fs.chunks',
    ];
    for (const i of d) {
        await dst.collection(i).deleteMany();
    }
    const t = [
        'user', 'problem', 'problem.status', 'solution', 'discussion',
        'discussion.reply', 'contest', 'training', 'fs.files', 'fs.chunks',
    ];
    for (const i of t) await task(i, src, report);
}

global.Hydro.script.migrateVijos = module.exports = migrateVijos;
