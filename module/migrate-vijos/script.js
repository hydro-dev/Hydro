/* eslint-disable no-await-in-loop */
const { mongodb } = global.Hydro.nodeModules;
const dst = global.Hydro.service.db;

const map = {};

const pid = (id) => {
    if (map[id.toString()]) return map[id.toString()];
    if (id.generationTime) return id;
    id = id.toString();
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
    }),
    document: async (doc) => {
        const res = {};
        const mapper = {
            _id: '_id',
            doc_id: 'docId',
            doc_type: 'docType',
            num_submit: 'nSubmit',
            num_accept: 'nAccept',
            difficulty: 'difficulty',
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
        };
        for (const key in doc) {
            if (typeof mapper[key] === 'string') {
                res[mapper[key]] = doc[key];
            } else if (typeof mapper[key] === 'object') {
                res[mapper[key].field] = mapper[key].processer(doc[key]);
            } else {
                console.log('Unknown key:', key);
            }
        }
        return res;
    },
    'document.status': async (doc) => {
        const res = {};
        const mapper = {
            _id: '_id',
            doc_id: 'docId',
            doc_type: 'docType',
            uid: 'uid',
            domain_id: 'domainId',
            num_accept: 'nAccept',
            num_submit: 'nSubmit',
            rp: 'rp',
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
        };
        for (const key in doc) {
            if (typeof mapper[key] === 'string') {
                res[mapper[key]] = doc[key];
            } else if (typeof mapper[key] === 'object') {
                res[mapper[key].field] = mapper[key].processer(doc[key]);
            } else {
                console.log('Unknown key:', key);
            }
        }
        return res;
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
    'fs.files': async (doc) => doc,
    'fs.chunks': async (doc) => doc,
    file: async (doc) => ({
        _id: doc._id,
        count: doc.metadata.link,
        secret: doc.metadata.secret,
        size: doc.length,
        md5: doc.md5,
    }),
};

const cursor = {
    user: (s) => s.collection('user').find(),
    document: (s) => s.collection('document').find(),
    'document.status': (s) => s.collection('document.status').find(),
    record: (s) => s.collection('record').find(),
    'fs.files': (s) => s.collection('fs.files').find(),
    'fs.chunks': (s) => s.collection('fs.chunks').find(),
    file: (s) => s.collection('fs.files').find(),
};

async function fixPid(report) {
    const count = await dst.collection('document').find({ docType: 10 }).count();
    await report({ progress: 1, message: `Fix pid: ${count}` });
    const total = Math.floor(count / 50);
    for (let i = 0; i <= total; i++) {
        const docs = await dst.collection('document')
            .find({ docType: 10 }).skip(i * 50).limit(50)
            .toArray();
        for (const doc of docs) {
            dst.collection('document').updateOne(
                { _id: doc._id },
                { $set: { pid: doc.pid || doc.docId.toString() } },
            );
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
            const d = await tasks[name](doc);
            if (d) {
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
                    res.push(dst.collection(name).updateOne(
                        query, { $set: docWithoutDid }, { upsert: true },
                    ));
                } else if (d._id) {
                    res.push(dst.collection(name).updateOne({
                        _id: d._id,
                    }, { $set: docWithoutId }, { upsert: true }));
                } else res.push(dst.collection(name).insertOne(d));
            }
        }
        await Promise.all(res);
        const progress = Math.round(100 * ((i + 1) / (total + 1)));
        if (progress > lastProgress) {
            await report({ progress });
            lastProgress = progress;
        }
    }
    await fixPid(report);
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
    return true;
}

global.Hydro.script.migrateVijos = module.exports = { run: migrateVijos };
