const
    db = require('../service/db.js'),
    coll = db.collection('system');

async function get(_id) {
    let doc = await coll.findOne({ _id });
    if (doc) return doc.value;
}
async function update(_id, update, config) {
    await coll.findOneAndUpdate({ _id }, update, config);
    return this.get(_id);
}
/**
 * Increments the user counter.
 * @returns {number} Integer value after increment.
 */
async function incUserCounter() {
    return await this.update('userCounter', { $inc: { value: 1 } }, { upsert: true });
}
/**
 * Increments the problem ID counter.
 * @returns {number} Integer value before increment.
 */
async function incPidCounter() {
    return await this.update('userCounter', { $inc: { value: 1 } }, { upsert: true });
}
async function acquireLock(name) {
    let value = Math.floor(Math.random() * 0xFFFFFFFF);
    try {
        await coll.updateOne({ _id: 'lock_' + name, value: 0 }, { $set: { value } }, { upsert: true });
    } catch (e) { return null; }
    return value;
}
async function releaseLock(name, value) {
    let result = await coll.updateOne({ _id: 'lock_' + name, value }, { $set: { value: 0 } });
    return !!result.matchedCount;
}
async function releaseLockAnyway(name) {
    await coll.updateOne({ _id: 'lock_' + name }, { $set: { value: 0 } });
    return true;
}
module.exports = {
    get,
    update,
    incPidCounter,
    incUserCounter,
    acquireLock,
    releaseLock,
    releaseLockAnyway
};

/*

EXPECTED_DB_VERSION = 1


async def acquire_upgrade_lock():
  lock = await acquire_lock('upgrade')
  if not lock:
    raise error.UpgradeLockAcquireError()
  return lock


async def release_upgrade_lock(lock: int):
  success = await release_lock('upgrade', lock)
  if not success:
    raise error.UpgradeLockReleaseError()
  return True


@argmethod.wrap
async def release_upgrade_lock_anyway():
  return await release_lock_anyway('upgrade')


@argmethod.wrap
async def get_db_version():
  coll = db.coll('system')
  doc = await coll.find_one({'_id': 'db_version'})
  if doc is None:
    return 0
  else:
    return doc['value']


async def set_db_version(version: int):
  coll = db.coll('system')
  result = await coll.update_one(filter={'_id': 'db_version'},
                                 update={'$set': {'value': version}},
                                 upsert=True)
  return result.modified_count


async def ensure_db_version(allowed_version=None):
  if allowed_version is None:
    allowed_version = EXPECTED_DB_VERSION
  current_version = await get_db_version()
  if current_version != allowed_version:
    raise error.DatabaseVersionMismatchError(current_version, allowed_version)


@argmethod.wrap
async def setup():
  """
  Set up for fresh install
  """
  coll = db.coll('system')
  fdoc = await coll.find_one({'_id': 'user_counter'})
  if fdoc:
    # skip if not fresh install
    return
  await set_db_version(EXPECTED_DB_VERSION)


if __name__ == '__main__':
  argmethod.invoke_by_args()

*/