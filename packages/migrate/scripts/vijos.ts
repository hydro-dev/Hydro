/* eslint-disable ts/naming-convention */
/* eslint-disable no-await-in-loop */
import mongodb, { Db, FindCursor } from 'mongodb';
import {
    db as dst,
    DiscussionModel, DiscussionTailReplyDoc, DocumentModel,
    RecordDoc, TestCase, TrainingNode,
} from 'hydrooj';

const map = {};
const pid = (id) => {
    if (map[id.toString()]) return map[id.toString()];
    return id;
};

type Report = (args: { progress?: number, message?: string }) => void;

const tasks = {
    user: async (doc) => ({
        _id: doc._id,
        uname: doc.uname,
        unameLower: doc.uname_lower,
        salt: doc.salt,
        hash: doc.hash.split('|')[1],
        hashType: doc.hash.split('|')[0] === 'vj4' ? 'hydro' : doc.hash.split('|')[0],
        priv: doc.priv,
        avatar: `gravatar:${doc.gravatar}`,
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
        pname: 'pid',
        title: 'title',
        content: 'content',
        owner_uid: 'owner',
        category: 'category',
        hidden: 'hidden',
        data: 'data',
        tag: 'tag',
        vote: 'vote',
        reply: {
            field: 'reply',
            processer: (reply) => {
                const res = [];
                for (const r of reply) {
                    const drrdoc: DiscussionTailReplyDoc = {
                        _id: r._id,
                        content: r.content,
                        owner: r.owner_uid,
                        ip: r.ip,
                    };
                    res.push(drrdoc);
                }
                return res;
            },
        },
        parent_doc_id: {
            field: 'parentId',
            processer: (parentId, doc) => {
                if (doc.parent_doc_type === DocumentModel.TYPE_PROBLEM) {
                    return pid(parentId);
                }
                return parentId;
            },
        },
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
                    n[Number.parseInt(key, 10) / 3600] = rule;
                }
                return n;
            },
        },
        rule: {
            field: 'rule',
            processer: (rule: number) => {
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
        enroll: 'attend',
        rated: 'rated',
        dag: {
            field: 'dag',
            processer: (dag) => {
                const r: TrainingNode[] = [];
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
        penalty_score: 'penaltyScore',
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
    'domain.user': {
        _id: '_id',
        domain_id: 'domainId',
        uid: 'uid',
        num_problems: 'nProblem',
        num_submit: 'nSubmit',
        num_accept: 'nAccept',
        num_liked: 'nLiked',
        level: 'level',
        role: 'role',
        join_at: 'joinAt',
        display_name: 'displayName',
        rp: null,
        rank: null,
        userfile_usage: null,
    },
    record: async (doc) => {
        if (doc.hidden) return null;
        const testCases: Required<TestCase>[] = [];
        let i = 1;
        for (const c of doc.cases || []) {
            testCases.push({
                id: i++,
                subtaskId: 0,
                score: 0,
                status: c.status,
                time: c.time_ms || c.time,
                memory: c.memory_kb || c.memory,
                message: (c.judge_text || '') + (c.message || ''),
            });
        }
        const rdoc: RecordDoc = {
            _id: doc._id,
            status: doc.status,
            score: doc.score,
            time: doc.time_ms,
            memory: doc.memory_kb,
            code: doc.code,
            lang: doc.lang,
            uid: doc.uid,
            source: `${doc.domainId}/${pid(doc.pid)}`,
            pid: pid(doc.pid),
            domainId: doc.domain_id,
            judger: doc.judge_uid || 1,
            judgeAt: doc.judge_at || new Date(),
            judgeTexts: doc.judge_texts || [],
            compilerTexts: doc.compiler_texts || [],
            testCases,
            rejudged: !!doc.rejudged,
        };
        if (doc.rejudged) rdoc.rejudged = true;
        if (doc.tid) rdoc.contest = doc.tid;
        return rdoc;
    },
    domain: {
        _id: '_id',
        doc_id: 'docId',
        doc_type: 'docType',
        owner_uid: 'owner',
        owner: 'owner',
        name: 'name',
        roles: {
            field: 'roles',
            processer: (roles) => {
                const res = {};
                for (const role in roles) {
                    res[role] = roles[role].toString();
                }
                return res;
            },
        },
        gravatar: {
            field: 'avatar',
            processer: (gravatar) => `gavatar:${gravatar}`,
        },
        bulletin: 'bulletin',
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

type CursorGetter = (s: Db) => FindCursor<any>;

const cursor: NodeJS.Dict<CursorGetter> = {
    user: (s) => s.collection('user').find(),
    document: (s) => s.collection('document').find({ doc_type: { $ne: 20 } }),
    'document.status': (s) => s.collection('document.status').find(),
    'domain.user': (s) => s.collection('domain.user').find(),
    record: (s) => s.collection('record').find(),
    domain: (s) => s.collection('domain').find(),
    'fs.files': (s) => s.collection('fs.files').find(),
    'fs.chunks': (s) => s.collection('fs.chunks').find(),
    file: (s) => s.collection('fs.files').find(),
};

async function discussionNode(src: Db, report: Report) {
    const count = await src.collection('document').countDocuments({ doc_type: 20 });
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
                        t.push(DiscussionModel.addNode(
                            doc.domain_id, node.name, category, { pic: node.pic },
                        ));
                    } else {
                        t.push(DiscussionModel.addNode(doc.domain_id, node.name, category, {}));
                    }
                }
            }
            await Promise.all(t).catch((e) => e);
        }
        await report({ progress: Math.round(100 * ((i + 1) / (total + 1))) });
    }
}

function addSpace(content: string) {
    const lines = content.split('\r\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].endsWith('|')) continue; // Markdown table;
        if (!lines[i].endsWith('  ')) lines[i] = `${lines[i]}  `;
    }
    return lines.join('\n');
}

async function fix(doc) {
    await dst.collection('document').updateOne(
        { _id: doc._id },
        { $set: { pid: doc.pid || doc.docId.toString(), content: addSpace(doc.content) } },
    );
}

async function fixProblem(report: Report) {
    const count = await dst.collection('document').countDocuments({ docType: 10 });
    await report({ progress: 1, message: `Fix pid: ${count}` });
    const total = Math.floor(count / 50);
    for (let i = 0; i <= total; i++) {
        const docs = await dst.collection('document')
            .find({ docType: 10 }).skip(i * 50).limit(50)
            .toArray();
        for (const doc of docs) {
            await fix(doc).catch((e) => report({ message: `${e.toString()}\n${e.stack}` }));
        }
        await report({ progress: Math.round(100 * ((i + 1) / (total + 1))) });
    }
}

function objid(ts: Date) {
    const p = Math.floor(ts.getTime() / 1000).toString(16);
    const id = new mongodb.ObjectId();
    return new mongodb.ObjectId(p + id.toHexString().slice(8, 8 + 6 + 4 + 6));
}

// FIXME this seems not working
async function message(src: Db, report: Report) {
    const count = await src.collection('message').countDocuments();
    await report({ progress: 1, message: `Messages: ${count}` });
    const total = Math.floor(count / 50);
    for (let i = 0; i <= total; i++) {
        const docs = await src.collection('message')
            .find().skip(i * 50).limit(50)
            .toArray();
        for (const doc of docs) {
            for (const msg of doc.reply) {
                await dst.collection('message').insertOne({
                    _id: objid(msg.at),
                    from: msg.sender_uid,
                    to: msg.sender_uid === doc.sender_uid ? doc.sendee_uid : doc.sender_uid,
                    content: msg.content,
                    // Mark all as read
                    flag: 0,
                });
            }
        }
        await report({ progress: Math.round(100 * ((i + 1) / (total + 1))) });
    }
}

async function removeInvalidPid(report: Report) {
    const count = await dst.collection('document').countDocuments({ docType: 10 });
    const bulk = dst.collection('document').initializeUnorderedBulkOp();
    await report({ progress: 1, message: `Remove pid: ${count}` });
    const total = Math.floor(count / 50);
    for (let i = 0; i <= total; i++) {
        const docs = await dst.collection('document')
            .find({ docType: 10 }).skip(i * 50).limit(50)
            .toArray();
        for (const doc of docs) {
            const id = Number.parseInt(doc.pid, 10);
            if (Number.isSafeInteger(id)) {
                bulk.find({ _id: doc._id }).updateOne({ $unset: { pid: '' } });
            }
        }
        await bulk.execute();
    }
}

async function task(name: any, src: Db, report: Report) {
    await report({ progress: 1, message: `${name}` });
    let lastProgress = -1;
    for (let i = 0; ; i++) {
        const docs = await cursor[name](src).skip(i * 50).limit(50).toArray();
        if (!docs.length) break;
        const res = [];
        for (const doc of docs) {
            let d: any = {};
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
                        d[mapper[key].field] = mapper[key].processer(doc[key], doc);
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
                    const query: any = { domainId: d.domainId, docId: d.docId, docType: d.docType };
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
        if (i > lastProgress) {
            await report({ progress: i });
            lastProgress = i;
        }
    }
}

export async function run({
    host = 'localhost', port = 27017, name = 'vijos4', username, password,
}, report: Report) {
    let mongourl = 'mongodb://';
    if (username) mongourl += `${username}:${password}@`;
    mongourl += `${host}:${port}/${name}`;
    const Database = await mongodb.MongoClient.connect(mongourl, {});
    const src = Database.db(name);
    await report({ progress: 0, message: 'Database connected.' });
    const userCounter = await src.collection<any>('system').findOne({ _id: 'user_counter' });
    if (!userCounter) {
        report({ message: 'No valid installation found' });
        return false;
    }
    await report({ progress: 1, message: 'Collection:system done.' });
    if (!await dst.collection('system').findOne({ _id: 'migrateVijosFs' })) {
        const f = ['fs.files', 'fs.chunks'] as any;
        for (const i of f) {
            await dst.collection(i).deleteMany({});
            await task(i, src, report);
        }
        await dst.collection('system').insertOne({ _id: 'migrateVijosFs', value: 1 });
    }
    await dst.collection('user').deleteMany({ _id: { $nin: [0, 1] } });
    await dst.collection('message').deleteMany({});
    const d = ['domain', 'user', 'document', 'document.status', 'domain.user', 'record', 'file'];
    for (const i of d) await task(i, src, report);
    await fixProblem(report);
    await discussionNode(src, report);
    await message(src, report);
    await removeInvalidPid(report);
    await global.Hydro.model.system.set('db.ver', 1);
    return true;
}
