/* eslint-disable no-await-in-loop */
const Mongo = global.Hydro.nodeModules.mongodb;
const { ObjectID } = global.Hydro.nodeModules.bson;
const dst = global.Hydro.service.db;
const { problem } = global.Hydro.model.problem;

const RULES = ['', 'oi', 'acm'];

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

    })),
    problem: async (docs) => docs.map((doc) => ({
        _id: doc._id,
        pid: doc.doc_id || new ObjectID(),
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
    contest: async (docs) => docs.map((doc) => ({
        _id: doc._id,
        title: doc.title,
        content: doc.content,
        owner: doc.owner_uid,
        rule: RULES[doc.rule],
        beginAt: doc.begin_at,
        endAt: doc.end_at,
        pids: doc.pids,
        attend: doc.attend,
    })),
    solution: async (docs) => docs.map((doc) => ({
        _id: doc._id,
        title: doc.title,
        content: doc.content,
        vote: doc.vote,
    })),
};

const cursor = {
    problem: (s) => s.collection('document').find({ doc_type: 10 }),
    'problem.status': (s) => s.collection('document.status').find({ doc_type: 10 }),
    contest: (s) => s.collection('document').find({ doc_type: 30 }),
    user: (s) => s.collection('user').find(),
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
    const Database = await Mongo.MongoClient.connect(mongourl, {
        useNewUrlParser: true, useUnifiedTopology: true,
    });
    const src = Database.db(name);
    await report({ progress: 0, message: 'Database connected.' });
    await dst.collection('system').insertOne({
        _id: 'user',
        value: (await src.collection('system').findOne({ _id: 'user_counter' })).value,
    });
    await report({ progress: 1, message: 'Collection:system done.' });
    await task('problem', src, report);
    await task('problem.status', src, report);
    await task('contest', src, report);
}

global.Hydro.script.migrateVijos = module.exports = migrateVijos;
