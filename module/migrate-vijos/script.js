/* eslint-disable no-await-in-loop */
const fs = require('fs');
const os = require('os');

const { mongodb } = global.nodeModules;
const dst = global.Hydro.service.db;
const { file, problem, discussion } = global.Hydro.model;
const { readConfig } = global.Hydro.lib;

// TODO output enhancement

const map = {};

const pid = (id) => {
    if (map[id.toString()]) return map[id.toString()];
    return id;
};

const tasks = {
    user: async (doc) => ({
        _id: doc._id,
        uname: doc.uname,
        unameLower: doc.uname_lower,
        salt: doc.salt,
        hash: doc.hash.split('|')[1],
        hashType: doc.hash.split('|')[0] === 'vj4' ? 'hydro' : doc.hash.split('|')[0],
        priv: doc.priv === -1 ? 1 : 0,
        gravatar: doc.gravatar,
        mail: doc.mail,
        mailLower: doc.mail_lower,
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
    }),
    document: {
        _id: '_id',
        doc_id: 'docId',
        doc_type: 'docType',
        num_submit: 'nSubmit',
        num_accept: 'nAccept',
        difficulty: 'difficulty',
        difficulty_admin: null,
        pname: 'pid',
        title: 'title',
        content: 'content',
        owner_uid: 'owner',
        category: 'category',
        hidden: 'hidden',
        data: 'data',
        tag: 'tag',
        vote: 'vote',
        reply: 'reply',
        parent_doc_id: 'parentId',
        parent_doc_type: 'parentType',
        num_replies: 'nReply',
        views: 'views',
        highlight: 'highlight',
        ip: 'ip',
        domain_id: 'domainId',
        update_at: 'updateAt',
        begin_at: 'beginAt',
        end_at: 'endAt',
        penalty_since: 'penaltySince',
        penalty_rules: {
            field: 'penaltyRules',
            processer: (rule) => {
                const n = {};
                for (const key in rule) {
                    n[key / 3600] = rule;
                }
                return n;
            },
        },
        rule: {
            field: 'rule',
            processer: (rule) => {
                const rules = {
                    2: 'oi',
                    3: 'acm',
                    11: 'homework',
                };
                return rules[rule];
            },
        },
        pids: {
            field: 'pids',
            processer: (pids) => pids.map((p) => pid(p)),
        },
        attend: 'attend',
        desc: 'description',
        enroll: 'enroll',
        dag: {
            field: 'dag',
            processer: (dag) => {
                const r = [];
                for (const t of dag) {
                    r.push({
                        _id: t._id,
                        title: t.title,
                        requireNids: t.require_nids,
                        pids: t.pids.map((id) => pid(id)),
                    });
                }
                return r;
            },
        },
    },
    'document.status': {
        _id: '_id',
        doc_id: 'docId',
        doc_type: 'docType',
        uid: 'uid',
        domain_id: 'domainId',
        num_accept: 'nAccept',
        num_submit: 'nSubmit',
        status: 'status',
        accept: 'accept',
        vote: 'vote',
        star: 'star',
        enroll: 'enroll',
        rid: 'rid',
        rev: 'rev',
        attend: 'attend',
        journal: {
            field: 'journal',
            processer: (journal) => {
                const r = [];
                for (const i of journal) {
                    r.push({ ...i, pid: pid(i.pid) });
                }
                return r;
            },
        },
        detail: {
            field: 'detail',
            processer: (detail) => {
                const r = [];
                for (const i of detail) {
                    r.push({ ...i, pid: pid(i.pid) });
                }
                return r;
            },
        },
        score: 'score',
        time: 'time',
        done: 'done',
        done_nids: 'doneNids',
        done_pids: {
            field: 'donePids',
            processer: (pids) => pids.map((id) => pid(id)),
        },
        rp: null,
    },
    record: async (doc) => {
        const testCases = [];
        for (const c of doc.cases) {
            testCases.push({
                status: c.status,
                score: c.score,
                time: c.time_ms || c.time,
                memory: c.memory_kb || c.memory,
                judgeText: (c.judge_text || '') + (c.message || ''),
            });
        }
        return {
            _id: doc._id,
            status: doc.status,
            score: doc.score,
            time: doc.time_ms,
            memory: doc.memory_kb,
            code: doc.code,
            lang: doc.lang,
            uid: doc.uid,
            pid: pid(doc.pid),
            tid: doc.tid,
            domainId: doc.domain_id,
            judger: doc.judge_uid,
            judgeAt: doc.judge_at,
            judgeTexts: doc.judge_texts,
            compilerTexts: doc.compiler_texts,
            rejudged: doc.rejudged,
            testCases,
        };
    },
    domain: {
        _id: '_id',
        doc_id: 'docId',
        doc_type: 'docType',
        owner_uid: 'owner',
        name: 'name',
        gravatar: 'gravatar',
        bulletin: 'bulletin',
        pid_counter: 'pidCounter',
    },
    'fs.files': async (doc) => doc,
    'fs.chunks': async (doc) => doc,
    file: async (doc) => ({
        _id: doc._id,
        count: 0,
        secret: doc.metadata.secret,
        size: doc.length,
        md5: doc.md5,
    }),
};

const cursor = {
    user: (s) => s.collection('user').find(),
    document: (s) => s.collection('document').find({ doc_type: { $ne: 20 } }),
    'document.status': (s) => s.collection('document.status').find(),
    record: (s) => s.collection('record').find(),
    domain: (s) => s.collection('domain').find(),
    'fs.files': (s) => s.collection('fs.files').find(),
    'fs.chunks': (s) => s.collection('fs.chunks').find(),
    file: (s) => s.collection('fs.files').find(),
};

async function discussionNode(src, report) {
    const count = await src.collection('document').find({ doc_type: 20 }).count();
    await report({ progress: 1, message: `discussion.node: ${count}` });
    const total = Math.floor(count / 5);
    for (let i = 0; i <= total; i++) {
        const docs = await src.collection('document')
            .find({ doc_type: 20 }).skip(i * 5).limit(5)
            .toArray();
        for (const doc of docs) {
            const t = [];
            for (const item of doc.content || []) {
                const category = item[0];
                const nodes = item[1];
                for (const node of nodes || []) {
                    if (node.pic) {
                        t.push(discussion.addNode(
                            doc.domain_id, node.name, category, { pic: node.pic },
                        ));
                    } else {
                        t.push(discussion.addNode(doc.domain_id, node.name, category));
                    }
                }
            }
            await Promise.all(t).catch((e) => e);
        }
        await report({ progress: Math.round(100 * ((i + 1) / (total + 1))) });
    }
}

async function domainUser(src, report) {
    const count = await src.collection('domain.user').find().count();
    await report({ progress: 1, message: `domain.user: ${count}` });
    const total = Math.floor(count / 50);
    for (let i = 0; i <= total; i++) {
        const docs = await src.collection('domain.user')
            .find().skip(i * 50).limit(50)
            .toArray();
        const t = [];
        for (const doc of docs) {
            const mapper = {
                _id: '_id',
                uid: 'uid',
                join_at: 'joinAt',
                role: 'role',
                num_liked: 'nLike',
                num_submit: 'nSubmit',
                num_accept: 'nAccept',
                num_problems: 'nProblems',
                domain_id: 'domainId',
                level: 'level',
                rp: null,
                rank: null,
            };
            const d = {};
            for (const key in doc) {
                if (typeof mapper[key] === 'string') {
                    d[mapper[key]] = doc[key];
                } else if (mapper[key] === null) {
                    // Ignore this key
                } else if (typeof mapper[key] === 'object') {
                    d[mapper[key].field] = mapper[key].processer(doc[key]);
                } else {
                    await report({ message: `Unknown key ${key} in collection domain.user` });
                }
            }
            const docWithoutId = {};
            for (const key in d) {
                if (key !== '_id') {
                    docWithoutId[key] = d[key];
                }
            }
            t.push(dst.collection('document.status').updateOne(
                { _id: d._id },
                {
                    $set: {
                        ...docWithoutId, docType: 0, docId: 0, role: docWithoutId.role || 'default',
                    },
                },
                { upsert: true },
            ));
        }
        await Promise.all(t);
        await report({ progress: Math.round(100 * ((i + 1) / (total + 1))) });
    }
}

async function fix(doc) {
    await dst.collection('document').updateOne(
        { _id: doc._id },
        { $set: { pid: doc.pid || doc.docId.toString() } },
    );
    if (doc.data && doc.data.generationTime) {
        await file.inc(doc.data);
        const r = await file.get(doc.data);
        const p = `${os.tmpdir()}/hydro/migrate.vijos.${doc._id}.zip`;
        const w = fs.createWriteStream(p);
        await new Promise((resolve, reject) => {
            w.on('finish', resolve);
            w.on('error', reject);
            r.pipe(w);
        });
        const config = await readConfig(p);
        await dst.collection('document').updateOne(
            { _id: doc._id },
            { $set: { config } },
        );
        fs.unlinkSync(p);
    } else if (doc.data) {
        const pdoc = await problem.get(doc.data.domain, pid(doc.data.pid));
        await Promise.all([
            file.inc(pdoc.data),
            dst.collection('document').updateOne(
                { _id: doc._id },
                { $set: { data: pdoc.data } },
            ),
        ]);
        const r = await file.get(pdoc.data);
        const p = `${os.tmpdir()}/hydro/migrate.vijos.${doc._id}.zip`;
        const w = fs.createWriteStream(p);
        await new Promise((resolve, reject) => {
            w.on('finish', resolve);
            w.on('error', reject);
            r.pipe(w);
        });
        const config = await readConfig(p);
        await dst.collection('document').updateOne(
            { _id: doc._id },
            { $set: { config } },
        );
        fs.unlinkSync(p);
    }
}

async function fixProblem(report) {
    const count = await dst.collection('document').find({ docType: 10 }).count();
    await report({ progress: 1, message: `Fix pid: ${count}` });
    const total = Math.floor(count / 50);
    for (let i = 0; i <= total; i++) {
        const docs = await dst.collection('document')
            .find({ docType: 10 }).skip(i * 50).limit(50)
            .toArray();
        for (const doc of docs) {
            try {
                await fix(doc);
            } catch (e) {
                await report({ message: e.toString() });
            }
        }
        await report({ progress: Math.round(100 * ((i + 1) / (total + 1))) });
    }
}

async function task(name, src, report) {
    const count = await cursor[name](src).count();
    await report({ progress: 1, message: `${name}: ${count}` });
    const total = Math.floor(count / 50);
    let lastProgress = -1;
    for (let i = 0; i <= total; i++) {
        const docs = await cursor[name](src).skip(i * 50).limit(50).toArray();
        const res = [];
        for (const doc of docs) {
            let d = {};
            if (typeof tasks[name].call === 'function') {
                d = await tasks[name](doc);
            } else {
                const mapper = tasks[name];
                for (const key in doc) {
                    if (typeof mapper[key] === 'string') {
                        d[mapper[key]] = doc[key];
                    } else if (mapper[key] === null) {
                        // Ignore this key
                    } else if (typeof mapper[key] === 'object') {
                        d[mapper[key].field] = mapper[key].processer(doc[key]);
                    } else {
                        await report({ message: `Unknown key ${key} in collection ${name}` });
                    }
                }
            }
            if (d) {
                if (d.rule) d.rated = true; // Hack contest rated field
                const docWithoutId = {};
                const docWithoutDid = {};
                for (const key in d) {
                    if (key !== '_id') {
                        if (key !== 'domainId' && key !== 'docId' && key !== 'docType' && key !== 'uid') {
                            docWithoutDid[key] = d[key];
                        }
                        docWithoutId[key] = d[key];
                    }
                }
                if (d.domainId && d.docId && d.docType) {
                    const query = { domainId: d.domainId, docId: d.docId, docType: d.docType };
                    if (d.uid) query.uid = d.uid;
                    res.push((async () => {
                        const data = await dst.collection(name).findOne(query);
                        if (data) {
                            await dst.collection(name).updateOne(query, { $set: docWithoutDid });
                        } else if (d._id) {
                            const dat = await dst.collection(name).findOne({ _id: d._id });
                            if (dat) {
                                await dst.collection(name).updateOne({
                                    _id: d._id,
                                }, { $set: docWithoutId });
                            } else {
                                await dst.collection(name).insertOne(d);
                            }
                        } else {
                            await dst.collection(name).insertOne(d);
                        }
                    })());
                } else if (d._id) {
                    res.push(dst.collection(name).updateOne({
                        _id: d._id,
                    }, { $set: docWithoutId }, { upsert: true }));
                } else res.push(dst.collection(name).insertOne(d));
            }
        }
        await Promise.all(res).catch((e) => report({ message: `${e}\n${e.stack}` }));
        const progress = Math.round(100 * ((i + 1) / (total + 1)));
        if (progress > lastProgress) {
            await report({ progress });
            lastProgress = progress;
        }
    }
}

async function migrateVijos({
    host, port, name, username, password,
}, report) {
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
    if (!await dst.collection('system').findOne({ _id: 'migrateVijosFs' })) {
        const f = ['fs.files', 'fs.chunks'];
        for (const i of f) {
            await dst.collection(i).deleteMany();
            await task(i, src, report);
        }
        await dst.collection('system').insertOne({ _id: 'migrateVijosFs', value: true });
    }
    await dst.collection('user').deleteMany({ _id: { $nin: [0, 1] } });
    const d = ['user', 'document', 'document.status', 'record', 'file'];
    for (const i of d) await task(i, src, report);
    await fixProblem(report);
    await discussionNode(src, report);
    await domainUser(src, report);
    return true;
}

global.Hydro.script.migrateVijos = module.exports = { run: migrateVijos };
