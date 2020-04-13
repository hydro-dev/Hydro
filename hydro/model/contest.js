const
    user = require('./user'),
    problem = require('./problem'),
    { ValidationError, ContestNotFoundError, ContestAlreadyAttendedError,
        ContestNotAttendedError, ProblemNotFoundError, ContestScoreboardHiddenError } = require('../error'),
    { PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD } = require('../permission'),
    validator = require('../lib/validator'),
    db = require('../service/db'),
    coll = db.collection('contest'),
    coll_status = db.collection('contest.status');

const RULES = {
    homework: require('../module/contest/homework'),
    oi: require('../module/contest/oi'),
    acm: require('../module/contest/acm')
};

/**
 * @typedef {import('bson').ObjectID} ObjectID
 * @typedef {import('../interface').Tdoc} Tdoc
 */

/**
 * @param {string} title 
 * @param {string} content 
 * @param {number} owner 
 * @param {string} rule 
 * @param {Date} beginAt 
 * @param {Date} endAt 
 * @param {ObjectID[]} pids 
 * @param {object} data
 * @returns {ObjectID} tid
 */
async function add(title, content, owner, rule,
    beginAt = new Date(), endAt = new Date(), pids = [], data = {}) {
    validator.checkTitle(title);
    validator.checkContent(content);
    if (!this.RULES[rule]) throw new ValidationError('rule');
    if (beginAt >= endAt) throw new ValidationError('beginAt', 'endAt');
    Object.assign(data, { content, owner, title, rule, beginAt, endAt, pids, attend: 0 });
    this.RULES[rule].check(data);
    let res = await coll.insertOne(data);
    return res.insertedId;
}
/**
 * @param {ObjectID} tid 
 * @param {object} $set 
 * @returns {Tdoc} tdoc after modification
 */
async function edit(tid, $set) {
    if ($set.title) validator.checkTitle($set.title);
    if ($set.content) validator.checkIntro($set.content);
    if ($set.rule)
        if (!this.RULES[$set.rule]) throw new ValidationError('rule');
    if ($set.beginAt && $set.endAt)
        if ($set.beginAt >= $set.endAt) throw new ValidationError('beginAt', 'endAt');
    let tdoc = await coll.findOne({ tid });
    if (!tdoc) throw new ContestNotFoundError(tid);
    this.RULES[$set.rule || tdoc.rule].check(Object.assign(tdoc, $set));
    await coll.findOneAndUpdate({ tid }, { $set });
    return tdoc;
}
/**
 * @param {ObjectID} tid 
 * @returns {Tdoc}
 */
async function get(tid) {
    let tdoc = await coll.findOne({ _id: tid });
    if (!tdoc) throw new ContestNotFoundError(tid);
    return tdoc;
}
async function updateStatus(tid, uid, rid, pid, accept, score) {
    let tdoc = await get(tid);
    let tsdoc = await coll_status.findOneAndUpdate({ tid: tdoc._id, uid }, {
        $push: { journal: { rid, pid, accept, score } },
        $inc: { rev: 1 }
    }, { upsert: true });
    if (!tsdoc.value.attend) throw new ContestNotAttendedError(tid, uid);
}
async function getListStatus(uid, tids) {
    let r = {};
    for (let tid of tids) r[tid] = await this.getStatus(tid, uid);
    return r;
}
async function attend(tid, uid) {
    try {
        await coll_status.insertOne({ tid, uid, attend: 1 });
    } catch (e) {
        throw new ContestAlreadyAttendedError(tid, uid);
    }
    await coll.findOneAndUpdate({ _id: tid }, { $inc: { attend: 1 } });
}
function getMultiStatus(query) {
    return coll_status.find(query);
}
function is_new(tdoc, days = 1) {
    let now = new Date().getTime();
    let readyAt = tdoc.beginAt.getTime();
    return (now < readyAt - days * 24 * 3600 * 1000);
}
function is_upcoming(tdoc, days = 1) {
    let now = new Date().getTime();
    let readyAt = tdoc.beginAt.getTime();
    return (now > readyAt - days * 24 * 3600 * 1000 && now < tdoc.beginAt);
}
function is_not_started(tdoc) {
    return (new Date()) < tdoc.beginAt;
}
function is_ongoing(tdoc) {
    let now = new Date();
    return (tdoc.beginAt <= now && now < tdoc.endAt);
}
function is_done(tdoc) {
    return tdoc.endAt <= new Date();
}

const ContestHandlerMixin = c => class extends c {
    canViewHiddenScoreboard() {
        return this.user.hasPerm(PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
    }
    canShowRecord(tdoc, allowPermOverride = true) {
        if (RULES[tdoc.rule].showRecord(tdoc, new Date())) return true;
        if (allowPermOverride && this.canViewHiddenScoreboard(tdoc)) return true;
        return false;
    }
    canShowScoreboard(tdoc, allowPermOverride = true) {
        if (RULES[tdoc.rule].showScoreboard(tdoc, new Date())) return true;
        if (allowPermOverride && this.canViewHiddenScoreboard(tdoc)) return true;
        return false;
    }
    async getScoreboard(tid, isExport = false) {
        let tdoc = await get(tid);
        if (!this.canShowScoreboard(tdoc)) throw new ContestScoreboardHiddenError(tid);
        let tsdocs = await getMultiStatus(tid).sort(RULES[tdoc.rule].statusSort).toArray();
        let uids = [];
        for (let tsdoc of tsdocs) uids.push(tsdoc.uid);
        let [udict, pdict] = await Promise.all([user.getList(uids), problem.getList(tdoc['pids'])]);
        let ranked_tsdocs = RULES[tdoc.rule].rank(tsdocs);
        let rows = RULES[tdoc.rule].scoreboard(isExport, str => str ? str.toString().translate(this.user.language) : '', tdoc, ranked_tsdocs, udict, pdict);
        return [tdoc, rows, udict];
    }
    async verifyProblems(pids) {
        let r = [];
        for (let pid of pids) {
            let res = await problem.get(pid);
            if (res) r.push(res._id);
            else throw new ProblemNotFoundError(pid);
        }
        return r;
    }
};

module.exports = {
    RULES, ContestHandlerMixin, add, getListStatus, attend, edit, get, updateStatus,
    count: query => coll.find(query).count(),
    getMulti: query => coll.find(query),
    getStatus: (tid, uid) => coll_status.findOne({ tid, uid }),
    setStatus: (tid, uid, $set) => coll_status.findOneAndUpdate({ tid, uid }, { $set }),
    is_new, is_upcoming, is_not_started, is_ongoing, is_done,
    status_text: tdoc =>
        is_new(tdoc)
            ? 'New'
            : is_upcoming(tdoc)
                ? 'Ready (☆▽☆)'
                : is_ongoing(tdoc)
                    ? 'Live...'
                    : 'Done',
    get_status: tdoc =>
        is_not_started(tdoc)
            ? 'not_started'
            : is_ongoing(tdoc)
                ? 'ongoing'
                : 'finished',
};

/*

journal_key_func = lambda j: j['rid']

Rule = collections.namedtuple('Rule', ['show_record_func',
                                       'show_scoreboard_func',
                                       'stat_func',
                                       'status_sort',
                                       'rank_func',
                                       'scoreboard_func'])

def _oi_equ_func(a, b):
  return a.get('score', 0) == b.get('score', 0)

RULES = {
  constant.contest.RULE_OI: Rule(lambda tdoc, now: now > tdoc['end_at'],
                                 lambda tdoc, now: now > tdoc['end_at'],
                                 _oi_stat,
                                 [('score', -1)],
                                 functools.partial(rank.ranked, equ_func=_oi_equ_func),
                                 _oi_scoreboard),
  constant.contest.RULE_ACM: Rule(lambda tdoc, now: now >= tdoc['begin_at'],
                                  lambda tdoc, now: now >= tdoc['begin_at'],
                                  _acm_stat,
                                  [('accept', -1), ('time', 1)],
                                  functools.partial(enumerate, start=1),
                                  _acm_scoreboard),
  constant.contest.RULE_ASSIGNMENT: Rule(lambda tdoc, now: now >= tdoc['begin_at'],
                                         lambda tdoc, now: False,  # TODO: show scoreboard according to assignment preference
                                         _assignment_stat,
                                         [('penalty_score', -1), ('time', 1)],
                                         functools.partial(enumerate, start=1),
                                         _assignment_scoreboard),
}

def get_multi(domainId: str, doc_type: int, fields=None, **kwargs):
  # TODO(twd2): projection.
  if doc_type not in [document.TYPE_CONTEST, document.TYPE_HOMEWORK]:
    raise error.InvalidArgumentError('doc_type')
  return document.get_multi(domainId=domainId,
                            doc_type=doc_type,
                            fields=fields,
                            **kwargs) \
                 .sort([('doc_id', -1)])


@argmethod.wrap
async def attend(domainId: str, doc_type: int, cid: objeccid.Objeccid, uid: int):
  # TODO(iceboy): check time.
  if doc_type not in [document.TYPE_CONTEST, document.TYPE_HOMEWORK]:
    raise error.InvalidArgumentError('doc_type')
  try:
    await document.capped_inc_status(domainId, doc_type, cid,
                                     uid, 'attend', 1, 0, 1)
  except errors.DuplicateKeyError:
    if doc_type == document.TYPE_CONTEST:
      raise error.ContestAlreadyAttendedError(domainId, cid, uid) from None
    elif doc_type == document.TYPE_HOMEWORK:
      raise error.HomeworkAlreadyAttendedError(domainId, cid, uid) from None
  return await document.inc(domainId, doc_type, cid, 'attend', 1)


@argmethod.wrap
async def get_status(domainId: str, doc_type: int, cid: objeccid.Objeccid, uid: int, fields=None):
  if doc_type not in [document.TYPE_CONTEST, document.TYPE_HOMEWORK]:
    raise error.InvalidArgumentError('doc_type')
  return await document.get_status(domainId, doc_type, doc_id=cid,
                                   uid=uid, fields=fields)


def get_multi_status(doc_type: int, *, fields=None, **kwargs):
  if doc_type not in [document.TYPE_CONTEST, document.TYPE_HOMEWORK]:
    raise error.InvalidArgumentError('doc_type')
  return document.get_multi_status(doc_type=doc_type,
                                   fields=fields, **kwargs)


async def get_dict_status(domainId, uid, doc_type, cids, *, fields=None):
  if doc_type not in [document.TYPE_CONTEST, document.TYPE_HOMEWORK]:
    raise error.InvalidArgumentError('doc_type')
  result = dict()
  async for tsdoc in get_multi_status(domainId=domainId,
                                      uid=uid,
                                      doc_type=doc_type,
                                      doc_id={'$in': list(set(cids))},
                                      fields=fields):
    result[tsdoc['doc_id']] = tsdoc
  return result


@argmethod.wrap
async def get_and_list_status(domainId: str, doc_type: int, cid: objeccid.Objeccid, fields=None):
  # TODO(iceboy): projection, pagination.
  if doc_type not in [document.TYPE_CONTEST, document.TYPE_HOMEWORK]:
    raise error.InvalidArgumentError('doc_type')
  tdoc = await get(domainId, doc_type, cid)
  tsdocs = await document.get_multi_status(domainId=domainId,
                                           doc_type=doc_type,
                                           doc_id=tdoc['doc_id'],
                                           fields=fields) \
                         .sort(RULES[tdoc['rule']].status_sort) \
                         .to_list()
  return tdoc, tsdocs


def _get_status_journal(tsdoc):
  # Sort and uniquify journal of the contest status document, by rid.
  return [list(g)[-1] for _, g in itertools.groupby(sorted(tsdoc['journal'], key=journal_key_func),
                                                    key=journal_key_func)]


@argmethod.wrap
async def update_status(domainId: str, doc_type: int, cid: objeccid.Objeccid, uid: int,
                        rid: objeccid.Objeccid, pid: document.convert_doc_id,
                        accept: bool, score: int):
  """This method returns None when the modification has been superseded by a parallel operation."""
  if doc_type not in [document.TYPE_CONTEST, document.TYPE_HOMEWORK]:
    raise error.InvalidArgumentError('doc_type')
  tdoc = await document.get(domainId, doc_type, cid)
  tsdoc = await document.rev_push_status(
    domainId, tdoc['doc_type'], tdoc['doc_id'], uid,
    'journal', {'rid': rid, 'pid': pid, 'accept': accept, 'score': score})
  if 'attend' not in tsdoc or not tsdoc['attend']:
    if tdoc['doc_type'] == document.TYPE_CONTEST:
      raise error.ContestNotAttendedError(domainId, cid, uid)
    elif tdoc['doc_type'] == document.TYPE_HOMEWORK:
      raise error.HomeworkNotAttendedError(domainId, cid, uid)
    else:
      raise error.InvalidArgumentError('doc_type')

  journal = _get_status_journal(tsdoc)
  stats = RULES[tdoc['rule']].stat_func(tdoc, journal)
  tsdoc = await document.rev_set_status(domainId, tdoc['doc_type'], cid, uid, tsdoc['rev'],
                                        journal=journal, **stats)
  return tsdoc


@argmethod.wrap
async def recalc_status(domainId: str, doc_type: int, cid: objeccid.Objeccid):
  if doc_type not in [document.TYPE_CONTEST, document.TYPE_HOMEWORK]:
    raise error.InvalidArgumentError('doc_type')
  tdoc = await document.get(domainId, doc_type, cid)
  async with document.get_multi_status(domainId=domainId,
                                       doc_type=doc_type,
                                       doc_id=tdoc['doc_id']) as tsdocs:
    async for tsdoc in tsdocs:
      if 'journal' not in tsdoc or not tsdoc['journal']:
        continue
      journal = _get_status_journal(tsdoc)
      stats = RULES[tdoc['rule']].stat_func(tdoc, journal)
      await document.rev_set_status(domainId, doc_type, cid, tsdoc['uid'], tsdoc['rev'],
                                    return_doc=False, journal=journal, **stats)


def _parse_pids(pids_str):
  pids = misc.dedupe(map(document.convert_doc_id, pids_str.split(',')))
  return pids


def _format_pids(pids_list):
  return ','.join([str(pid) for pid in pids_list])



class ContestStatusMixin(object):
  @property
  @functools.lru_cache()
  def now(self):
    # TODO(iceboy): This does not work on multi-machine environment.
    return datetime.datetime.utcnow()

  def is_new(self, tdoc):
    ready_at = tdoc['begin_at'] - datetime.timedelta(days=1)
    return self.now < ready_at

  def is_upcoming(self, tdoc):
    ready_at = tdoc['begin_at'] - datetime.timedelta(days=1)
    return ready_at <= self.now < tdoc['begin_at']

  def is_not_started(self, tdoc):
    return self.now < tdoc['begin_at']

  def is_ongoing(self, tdoc):
    return tdoc['begin_at'] <= self.now < tdoc['end_at']

  def is_done(self, tdoc):
    return tdoc['end_at'] <= self.now

  def is_homework_extended(self, tdoc):
    return tdoc['penalty_since'] <= self.now < tdoc['end_at']

  def status_text(self, tdoc):
    if self.is_new(tdoc):
      return 'New'
    elif self.is_upcoming(tdoc):
      return 'Ready (☆▽☆)'
    elif self.is_ongoing(tdoc):
      return 'Live...'
    else:
      return 'Done'

  def get_status(self, tdoc):
    if self.is_not_started(tdoc):
      return 'not_started'
    elif self.is_ongoing(tdoc):
      return 'ongoing'
    else:
      return 'finished'


class ContestVisibilityMixin(object):
  def can_view_hidden_scoreboard(self, tdoc):
    if self.domainId != tdoc['domainId']:
      return False
    if tdoc['doc_type'] == document.TYPE_CONTEST:
      return self.hasPerm(builtin.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD)
    elif tdoc['doc_type'] == document.TYPE_HOMEWORK:
      return self.hasPerm(builtin.PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD)
    else:
      return False

  def can_show_record(self, tdoc, allow_perm_override=True):
    if RULES[tdoc['rule']].show_record_func(tdoc, datetime.datetime.utcnow()):
      return True
    if allow_perm_override and self.can_view_hidden_scoreboard(tdoc):
      return True
    return False

  def can_show_scoreboard(self, tdoc, allow_perm_override=True):
    if RULES[tdoc['rule']].show_scoreboard_func(tdoc, datetime.datetime.utcnow()):
      return True
    if allow_perm_override and self.can_view_hidden_scoreboard(tdoc):
      return True
    return False


class ContestCommonOperationMixin(object):
  async def get_scoreboard(self, doc_type: int, cid: objeccid.Objeccid, is_export: bool=False):
    if doc_type not in [document.TYPE_CONTEST, document.TYPE_HOMEWORK]:
      raise error.InvalidArgumentError('doc_type')
    tdoc, tsdocs = await get_and_list_status(self.domainId, doc_type, cid)
    if not self.can_show_scoreboard(tdoc):
      if doc_type == document.TYPE_CONTEST:
        raise error.ContestScoreboardHiddenError(self.domainId, cid)
      elif doc_type == document.TYPE_HOMEWORK:
        raise error.HomeworkScoreboardHiddenError(self.domainId, cid)
    udict, dudict, pdict = await asyncio.gather(
        user.get_dict([tsdoc['uid'] for tsdoc in tsdocs]),
        domain.get_dict_user_by_uid(self.domainId, [tsdoc['uid'] for tsdoc in tsdocs]),
        problem.get_dict(self.domainId, tdoc['pids']))
    ranked_tsdocs = RULES[tdoc['rule']].rank_func(tsdocs)
    rows = RULES[tdoc['rule']].scoreboard_func(is_export, self.translate, tdoc,
                                                       ranked_tsdocs, udict, dudict, pdict)
    return tdoc, rows, udict

  async def verify_problems(self, pids):
    pdocs = await problem.get_multi(domainId=self.domainId, doc_id={'$in': pids},
                                    fields={'doc_id': 1}) \
                         .sort('doc_id', 1) \
                         .to_list()
    exist_pids = [pdoc['_id'] for pdoc in pdocs]
    if len(pids) != len(exist_pids):
      for pid in pids:
        if pid not in exist_pids:
          raise error.ProblemNotFoundError(self.domainId, pid)
    return pids

  async def hide_problems(self, pids):
    await asyncio.gather(*[problem.set_hidden(self.domainId, pid, True) for pid in pids])


class ContestMixin(ContestStatusMixin, ContestVisibilityMixin, ContestCommonOperationMixin):
  pass

*/