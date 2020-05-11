/* eslint-disable no-await-in-loop */
const Mongo = global.Hydro.nodeModules.mongodb;
const { ObjectID } = global.Hydro.nodeModules.bson;
const dst = global.Hydro.service.db;

function parseSolution(doc) {
    return {
        _id: doc._id,
        title: doc.title,
        content: doc.content,
        vote: doc.vote,
    };
}

async function problem(src, report) {
    let count = await src.collection('document').find({ doc_type: 10 }).count();
    await report({ progress: 1, message: `Found ${count} problems.` });
    for (let i = 0; i <= Math.floor(count / 50); i++) {
        const docs = await src.collection('document').find({ doc_type: 10 })
            .skip(i * 50).limit(50)
            .toArray();
        const problems = [];
        for (const doc of docs) {
            problems.push({
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
            });
        }
        await dst.collection('problem').insertMany(problems);
    }
    count = await src.collection('document.status').find({ doc_type: 10 }).count();
    for (let i = 0; i <= Math.floor(count / 50); i++) {
        const docs = await src.collection('document.status').find({ doc_type: 10 })
            .skip(i * 50).limit(50)
            .toArray();
        const problems = [];
        for (const doc of docs) {
            problems.push({
                pid: doc.pid,
                rid: doc.rid,
            });
        }
        await dst.collection('problem.status').insertMany(problems);
    }
    await report({ progress: 1, message: `Found ${count} problems.` });
}

async function contest(src, report) {
    const RULES = ['', 'oi', 'acm'];
    const count = await src.collection('document').find({ doc_type: 30 }).count();
    await report({ progress: 1, message: `Found ${count} contests.` });
    for (let i = 0; i <= Math.floor(count / 50); i++) {
        const docs = await src.collection('document').find({ doc_type: 30 })
            .skip(i * 50).limit(50)
            .toArray();
        const contests = [];
        for (const doc of docs) {
            contests.push({
                _id: doc._id,
                title: doc.title,
                content: doc.content,
                owner: doc.owner_uid,
                rule: RULES[doc.rule],
                beginAt: doc.begin_at,
                endAt: doc.end_at,
                pids: doc.pids,
                attend: doc.attend,
            });
        }
        await dst.collection('contests').insertMany(contests);
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
    await problem(src, report);
    await contest(src, report);
}

global.Hydro.script.migrateVijos = module.exports = migrateVijos;
