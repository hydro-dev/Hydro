const
    validator = require('../lib/validator'),
    { ValidationError, TrainingNotFoundError } = require('../error'),
    db = require('../service/db.js'),
    coll = db.collection('traning'),
    coll_status = db.collection('training.status');

module.exports = {
    SETTING_DIFFICULTY_ALGORITHM: 0,
    SETTING_DIFFICULTY_ADMIN: 1,
    SETTING_DIFFICULTY_AVERAGE: 2,

    async add(title, content, owner_uid, dag = [], desc = '') {
        validator.check_title(title);
        validator.check_intro(content);
        validator.check_description(desc);
        for (let node of dag)
            for (let nid of node['require_nids'])
                if (nid >= node._id)
                    throw new ValidationError('dag');
        return await coll.insertOne({
            content, owner_uid,
            dag, title, desc, enroll: 0
        });
    },
    count: (query) => coll.find(query).count(),
    async edit(tid, $set) {
        if ($set.title) validator.check_title($set.title);
        if ($set.content) validator.check_intro($set.content);
        if ($set.desc) validator.check_description($set.desc);
        if ($set.dag)
            for (let node of $set.dag)
                for (let nid of node.require_nids)
                    if (nid >= node._id) throw new ValidationError('dag');
        await coll.findOneAndUpdate({ tid }, { $set });
        let tdoc = await coll.findOne({ tid });
        if (!tdoc) throw new TrainingNotFoundError(tid);
        return tdoc;
    },
    async get(tid) {
        let tdoc = await coll.findOne({ tid });
        if (!tdoc) throw new TrainingNotFoundError(tid);
        return tdoc;
    },
    get_multi: (query) => coll.find( query),
    get_multi_status: (query) => coll_status.find(query),
    get_status: (tid, uid) => coll_status.findOne({ tid, uid }),
    set_status: (tid, uid, $set) => coll_status.findOneAndUpdate({ tid, uid }, { $set })

};

/*
async def get_dict_status(domainId, uid, tids, *, fields=None):
  result = dict()
  async for tsdoc in get_multi_status(domainId=domainId,
                                      uid=uid,
                                      doc_id={'$in': list(set(tids))},
                                      fields=fields):
    result[tsdoc['doc_id']] = tsdoc
  return result

async def get_dict(domainId, tids, *, fields=None):
  result = dict()
  async for tdoc in get_multi(domainId=domainId,
                              doc_id={'$in': list(set(tids))},
                              fields=fields):
    result[tdoc['doc_id']] = tdoc
  return result
*/