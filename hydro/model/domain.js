const
    validator = require('../utils').validator,
    user = require('./user'),
    { DomainAlreadyExistError, DomainNotFoundError } = require('../error'),
    db = require('../service/db.js'),
    coll = db.collection('domain');

module.exports = {
    /**
     * @param {string} domainId 
     * @param {int} owner
     * @param {roles} roles 
     * @param {str} name 
     * @param {str} gravatar 
     * @param {str} bulletin 
     */
    async add(domainId, owner, roles, name, gravatar, bulletin = '') {
        validator.checkDomainId(domainId);
        validator.checkName(name);
        validator.checkBulletin(bulletin);
        try {
            let result = await coll.insertOne({
                _id: domainId, pending: true, owner, roles, name, gravatar, bulletin
            });
            domainId = result.insertedId;
        } catch (e) {
            throw new DomainAlreadyExistError(domainId);
        }
        await (await user.getById(owner, domainId)).joinDomain('root');
        await coll.updateOne({ _id: domainId }, { $unset: { pending: '' } });
        return domainId;
    },
    /**
     * @param {string} domainId
     * @param {object} fields
     */
    async get(domainId, fields) {
        let ddoc = await coll.findOne({ _id: domainId }, fields);
        if (!ddoc) throw new DomainNotFoundError(domainId);
        return ddoc;
    },
    /**
     * Increments the problem ID counter.
     * @param {string} domainId 
     * @returns {number} Integer value before increment.
     */
    async incPidCounter(domainId) {
        await coll.updateOne({ _id: domainId, pidCounter: { $exists: false } },
            { $set: { pidCounter: 1000 } });
        let doc = await coll.findOneAndUpdate({ _id: domainId }, { $inc: { pidCounter: 1 } });
        return doc.value.pidCounter;
    },
    async incUser(domainId, uid, $inc) {
        let res = await coll.findOneAndUpdate({ domainId, uid }, { $inc }, { upsert: true });
        return res.value;
    }
};
/*

async def add_continue(domainId: str, ensure_owner_uid: int=None):
  ddoc = await get(domainId)
  if 'pending' not in ddoc:
    raise error.DomainNotFoundError(domainId)
  owner_uid = ddoc['owner_uid']
  if ensure_owner_uid != None and owner_uid != ensure_owner_uid:
    raise error.DomainNotFoundError(domainId)
  try:
    await add_user_role(domainId, owner_uid, builtin.ROLE_ROOT)
  except error.UserAlreadyDomainMemberError:
    pass
  coll = db.coll('domain')
  await coll.update_one({'_id': domainId},
                        {'$unset': {'pending': ''}})

def get_multi(*, fields=None, **kwargs):
  coll = db.coll('domain')
  return coll.find(kwargs, fields)


@argmethod.wrap
async def get_list(*, fields=None, limit: int=None, **kwargs):
  coll = db.coll('domain')
  return await coll.find(kwargs, fields).limit(limit).to_list(None)


def get_pending(**kwargs):
  return get_multi(pending=True, **kwargs)


@argmethod.wrap
async def edit(domainId: str, **kwargs):
  for domain in builtin.DOMAINS:
    if domain['_id'] == domainId:
      raise error.BuiltinDomainError(domainId)
  coll = db.coll('domain')
  if 'owner_uid' in kwargs:
    del kwargs['owner_uid']
  if 'name' in kwargs:
    validator.check_name(kwargs['name'])
  # TODO(twd2): check kwargs
  return await coll.find_one_and_update(filter={'_id': domainId},
                                        update={'$set': {**kwargs}},
                                        return_document=ReturnDocument.AFTER)


async def unset(domainId, fields):
  # TODO(twd2): check fields
  coll = db.coll('domain')
  return await coll.find_one_and_update(filter={'_id': domainId},
                                        update={'$unset': dict((f, '') for f in set(fields))},
                                        return_document=ReturnDocument.AFTER)


@argmethod.wrap
async def set_role(domainId: str, role: str, perm: int):
  return await set_roles(domainId, {role: perm})


@argmethod.wrap
async def set_roles(domainId: str, roles):
  roles = {str(role): int(perm) for role, perm in roles.items()}
  update = {}
  for role in roles:
    validator.check_role(role)
    if role in builtin.BUILTIN_ROLE_DESCRIPTORS:
      if not builtin.BUILTIN_ROLE_DESCRIPTORS[role].modifiable:
        raise error.ModifyBuiltinRoleError(domainId, role)
    update['roles.{0}'.format(role)] = roles[role]
  for domain in builtin.DOMAINS:
    if domain['_id'] == domainId:
      raise error.BuiltinDomainError(domainId)
  coll = db.coll('domain')
  return await coll.find_one_and_update(filter={'_id': domainId},
                                        update={'$set': update},
                                        return_document=ReturnDocument.AFTER)


@argmethod.wrap
async def delete_role(domainId: str, role: str):
  return await delete_roles(domainId, [role])


async def delete_roles(domainId: str, roles):
  roles = list(set(roles))
  for role in roles:
    validator.check_role(role)
    if role in builtin.BUILTIN_ROLE_DESCRIPTORS:
      raise error.ModifyBuiltinRoleError(domainId, role)
  for domain in builtin.DOMAINS:
    if domain['_id'] == domainId:
      raise error.BuiltinDomainError(domainId)
  user_coll = db.coll('domain.user')
  await user_coll.update_many({'domainId': domainId, 'role': {'$in': list(roles)}},
                              {'$unset': {'role': ''}})
  coll = db.coll('domain')
  return await coll.find_one_and_update(filter={'_id': domainId},
                                        update={'$unset': dict(('roles.{0}'.format(role), '')
                                                               for role in roles)},
                                        return_document=ReturnDocument.AFTER)


@argmethod.wrap
async def transfer(domainId: str, old_owner_uid: int, new_owner_uid: int):
  for domain in builtin.DOMAINS:
    if domain['_id'] == domainId:
      raise error.BuiltinDomainError(domainId)
  coll = db.coll('domain')
  return await coll.find_one_and_update(filter={'_id': domainId, 'owner_uid': old_owner_uid},
                                        update={'$set': {'owner_uid': new_owner_uid}},
                                        return_document=ReturnDocument.AFTER)


async def set_user(domainId, uid, **kwargs):
  coll = db.coll('domain.user')
  return await coll.find_one_and_update(filter={'domainId': domainId, 'uid': uid},
                                        update={'$set': kwargs},
                                        upsert=True,
                                        return_document=ReturnDocument.AFTER)


async def unset_user(domainId, uid, fields):
  coll = db.coll('domain.user')
  return await coll.find_one_and_update(filter={'domainId': domainId, 'uid': uid},
                                        update={'$unset': dict((f, '') for f in set(fields))},
                                        upsert=True,
                                        return_document=ReturnDocument.AFTER)


async def set_users(domainId, uids, **kwargs):
  coll = db.coll('domain.user')
  await coll.update_many({'domainId': domainId, 'uid': {'$in': list(set(uids))}},
                         {'$set': kwargs},
                         upsert=False)


async def unset_users(domainId, uids, fields):
  coll = db.coll('domain.user')
  await coll.update_many({'domainId': domainId, 'uid': {'$in': list(set(uids))}},
                         {'$unset': dict((f, '') for f in set(fields))},
                         upsert=True)



@argmethod.wrap
async def set_user_role(domainId: str, uid: int, role: str):
  validator.check_role(role)
  # use set_users to utilize "upsert=False"
  return await set_users(domainId, [uid], role=role)


@argmethod.wrap
async def unset_user_role(domainId: str, uid: int):
  return await unset_user(domainId, uid, ['role'])


async def set_users_role(domainId: str, uids, role: str):
  validator.check_role(role)
  await set_users(domainId, uids, role=role)


async def unset_users_role(domainId: str, uids):
  await unset_users(domainId, uids, ['role'])


async def inc_user_usage(domainId: str, uid: int, usage_field: str, usage: int, quota: int):
  coll = db.coll('domain.user')
  try:
    return await coll.find_one_and_update(filter={'domainId': domainId, 'uid': uid,
                                                  usage_field: {'$not': {'$gte': quota - usage}}},
                                          update={'$inc': {usage_field: usage}},
                                          upsert=True,
                                          return_document=ReturnDocument.AFTER)
  except errors.DuplicateKeyError:
    raise error.UsageExceededError(domainId, uid, usage_field, usage, quota)


def get_multi_user(*, fields=None, **kwargs):
  coll = db.coll('domain.user')
  return coll.find(kwargs, fields)


async def get_dict_user_by_uid(domainId, uids, *, fields=None):
  result = dict()
  async for dudoc in get_multi_user(
      domainId=domainId, uid={'$in': list(set(uids))}, fields=fields):
    result[dudoc['uid']] = dudoc
  return result


async def get_dict_user_by_domainId(uid, *, fields=None):
  result = dict()
  async for dudoc in get_multi_user(uid=uid, fields=fields):
    result[dudoc['domainId']] = dudoc
  return result


def get_all_roles(ddoc):
  builtin_roles = {role: rd.default_permission for role, rd in builtin.BUILTIN_ROLE_DESCRIPTORS.items()}
  domain_roles = ddoc['roles']
  return {**builtin_roles, **domain_roles}


def get_join_settings(ddoc, now):
  if 'join' not in ddoc:
    return None
  join_settings = ddoc['join']
  if not join_settings:
    return None
  if join_settings['method'] == constant.domain.JOIN_METHOD_NONE:
    return None
  if join_settings['role'] not in ddoc['roles']:
    return None
  if join_settings['expire'] != None and join_settings['expire'] < now:
    return None
  return join_settings


@argmethod.wrap
async def get_prefix_search(prefix: str, fields={}, limit: int=50):
  prefix_lower = prefix.lower()
  builtin_ddocs = []
  for domain in builtin.DOMAINS:
    if domain['_id'].lower().startswith(prefix_lower) or \
       domain['name'].lower().startswith(prefix_lower):
      builtin_ddocs.append(domain)
  regex = r'\A\Q{0}\E'.format(prefix.replace(r'\E', r'\E\\E\Q'))
  coll = db.coll('domain')
  ddocs = await coll.find({'$or': [{'_id': {'$regex': regex}},
                                   {'name': {'$regex': regex}}]},
                          projection=fields) \
                    .limit(limit) \
                    .to_list()
  return builtin_ddocs + ddocs


@argmethod.wrap
async def ensure_indexes():
  coll = db.coll('domain')
  await coll.create_index('owner_uid')
  await coll.create_index('name')
  user_coll = db.coll('domain.user')
  await user_coll.create_index('uid')
  await user_coll.create_index([('domainId', 1),
                                ('uid', 1)], unique=True)
  await user_coll.create_index([('domainId', 1),
                                ('role', 1)], sparse=True)
  await user_coll.create_index([('domainId', 1),
                                ('rp', -1)])
  await user_coll.create_index([('domainId', 1),
                                ('rank', 1)])


if __name__ == '__main__':
  argmethod.invoke_by_args()
*/