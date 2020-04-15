const validator = require('../lib/validator');
const { ValidationError, TrainingNotFoundError } = require('../error');
const db = require('../service/db.js');

const coll = db.collection('traning');
const collStatus = db.collection('training.status');

module.exports = {
    SETTING_DIFFICULTY_ALGORITHM: 0,
    SETTING_DIFFICULTY_ADMIN: 1,
    SETTING_DIFFICULTY_AVERAGE: 2,

    async add(title, content, owner, dag = [], desc = '') {
        validator.checkTitle(title);
        validator.checkIntro(content);
        validator.checkDescription(desc);
        for (const node of dag) { for (const nid of node.require_nids) if (nid >= node._id) throw new ValidationError('dag'); }
        return await coll.insertOne({
            content,
            owner,
            dag,
            title,
            desc,
            enroll: 0,
        });
    },
    count: (query) => coll.find(query).count(),
    async edit(tid, $set) {
        if ($set.title) validator.check_title($set.title);
        if ($set.content) validator.check_intro($set.content);
        if ($set.desc) validator.check_description($set.desc);
        if ($set.dag) { for (const node of $set.dag) for (const nid of node.require_nids) if (nid >= node._id) throw new ValidationError('dag'); }
        await coll.findOneAndUpdate({ tid }, { $set });
        const tdoc = await coll.findOne({ tid });
        if (!tdoc) throw new TrainingNotFoundError(tid);
        return tdoc;
    },
    async get(tid) {
        const tdoc = await coll.findOne({ tid });
        if (!tdoc) throw new TrainingNotFoundError(tid);
        return tdoc;
    },
    get_multi: (query) => coll.find(query),
    get_multi_status: (query) => collStatus.find(query),
    get_status: (tid, uid) => collStatus.findOne({ tid, uid }),
    set_status: (tid, uid, $set) => collStatus.findOneAndUpdate({ tid, uid }, { $set }),

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
