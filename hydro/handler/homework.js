const {
    ValidationError, HomeworkNotLiveError, ProblemNotFoundError,
    HomeworkNotAttendedError,
} = require('../error');
const {
    PERM_VIEW_HOMEWORK, PERM_ATTEND_HOMEWORK, PERM_VIEW_PROBLEM,
    PERM_SUBMIT_PROBLEM, PERM_CREATE_HOMEWORK, PERM_EDIT_HOMEWORK,
} = require('../permission');
const { Route, Handler } = require('../service/server');
const system = require('../model/system');
const user = require('../model/user');
const contest = require('../model/contest');
const discussion = require('../model/discussion');
const problem = require('../model/problem');
const record = require('../model/record');
const document = require('../model/document');
const paginate = require('../lib/paginate');

function _formatPenaltyRules(penaltyRules) {
    let doc = '';
    for (const time in penaltyRules) {
        const coefficient = penaltyRules[time];
        const parsedTime = Math.round(parseFloat(time) / 36) / 100;
        doc += '{0}: {1}\n'.format(parsedTime, coefficient);
    }
    return doc;
}

const HomeworkHandler = contest.ContestHandlerMixin(Handler);

class HomeworkMainHandler extends HomeworkHandler {
    async get({ domainId }) {
        const tdocs = await contest.getMulti(domainId, {}, document.TYPE_HOMEWORK).toArray();
        const calendar = [];
        for (const tdoc of tdocs) {
            console.log(tdoc);
            const cal = { ...tdoc };
            if (contest.isHomeWorkExtended(tdoc) || contest.isDone(tdoc)) {
                cal.endAt = tdoc.endAt;
                cal.penaltySince = tdoc.penaltySince;
            } else {
                cal.endAt = tdoc.penaltySince;
            }
            calendar.push(cal);
        }
        this.response.body = { tdocs, calendar };
        this.response.template = 'homework_main.html';
    }
}

class HomeworkDetailHandler extends HomeworkHandler {
    async get({ domainId, tid, page = 1 }) {
        const tdoc = await contest.get(domainId, tid, document.TYPE_HOMEWORK);
        const [tsdoc, pdict] = await Promise.all([
            contest.getStatus(domainId, tdoc.docId, this.user._id, document.TYPE_HOMEWORK),
            problem.getList(domainId, tdoc.pids),
        ]);
        const psdict = {};
        let rdict = {};
        let attended = false;
        if (tsdoc) {
            attended = tsdoc.attend === 1;
            for (const pdetail of tsdoc.detail || []) {
                psdict[pdetail.pid] = pdetail;
                rdict[pdetail.rid] = { _id: pdetail.rid };
            }
            if (this.canShowRecord(tdoc) && tsdoc.detail) {
                rdict = await record.getList(
                    domainId,
                    tsdoc.detail.map((pdetail) => pdetail.rid),
                    true,
                );
            }
        }
        // discussion
        const [ddocs, dpcount, dcount] = await paginate(
            discussion.getMulti(domainId, { parentType: tdoc.docType, parentId: tdoc.docId }),
            page,
            await system.get('DISCUSSION_PER_PAGE'),
        );
        const uids = ddocs.map((ddoc) => ddoc.owner);
        uids.push(tdoc.owner);
        const udict = await user.getList(domainId, uids);
        const path = [
            ['homework_main', '/homework'],
            [tdoc.title, null, true],
        ];
        this.response.template = 'homework_detail.html';
        this.response.body = {
            tdoc, tsdoc, attended, udict, pdict, psdict, rdict, ddocs, page, dpcount, dcount, path,
        };
    }

    async postAttend({ domainId, tid }) {
        this.checkPerm(PERM_ATTEND_HOMEWORK);
        const tdoc = await contest.get(domainId, tid, document.TYPE_HOMEWORK);
        if (contest.isDone(tdoc)) {
            throw new HomeworkNotLiveError(tdoc.docId);
        }
        await contest.attend(domainId, tdoc.docId, this.user._id, document.TYPE_HOMEWORK);
        this.back();
    }
}

class HomeworkDetailProblemHandler extends HomeworkHandler {
    async prepare({ domainId, tid, pid }) {
        this.checkPerm(PERM_VIEW_PROBLEM);
        [this.tdoc, this.pdoc] = await Promise.all([
            contest.get(domainId, tid, document.TYPE_HOMEWORK),
            problem.get(domainId, pid, this.user._id),
        ]);
    }

    async get({ domainId, tid, pid }) {
        const [tsdoc, udoc] = await Promise.all(
            contest.getStatus(domainId, tid, this.user._id, document.TYPE_HOMEWORK),
            user.getById(domainId, this.tdoc.owner),
        );
        const attended = tsdoc && tsdoc.attend === 1;
        if (!contest.isDone(this.tdoc)) {
            if (!attended) throw new HomeworkNotAttendedError(tid);
            if (!contest.isOngoing(this.tdoc)) throw new HomeworkNotLiveError(tid);
        }
        if (!this.tdoc.pids.includes(pid)) throw new ProblemNotFoundError(domainId, pid, tid);
        const path = [
            ['homework_main', '/homework'],
            [this.tdoc.title, `/homework/${tid}`, true],
            [this.pdoc.title, null, true],
        ];
        this.response.template = 'problem_detail.html';
        this.response.body = {
            tdoc: this.tdoc, pdoc: this.pdoc, tsdoc, udoc, attended, path,
        };
    }
}

class HomeworkDetailProblemSubmitHandler extends HomeworkHandler {
    async get({ domainId, tid, pid }) {
        const uid = this.user._id;
        const [tdoc, pdoc] = await Promise.all([
            contest.get(domainId, tid, document.TYPE_HOMEWORK),
            problem.get(domainId, pid, uid),
        ]);
        const [tsdoc, udoc] = await Promise.all([
            contest.getStatus(domainId, tdoc.docId, this.user._id, document.TYPE_HOMEWORK),
            user.get_by_uid(tdoc.owner),
        ]);
        const attended = tsdoc && tsdoc.attend === 1;
        if (!attended) { throw new HomeworkNotAttendedError(tdoc.docId); }
        if (!contest.isOngoing(tdoc)) { throw new HomeworkNotLiveError(tdoc.docId); }
        if (!tdoc.pids.includes(pid)) { throw new ProblemNotFoundError(domainId, pid, tdoc.docId); }
        const rdocs = this.canShowRecord(tdoc)
            ? await record.getUserInProblemMulti(domainId, uid, pdoc.docId, true)
                .sort('_id', -1)
                .limit(10)
                .toArray()
            : [];
        const path = [
            ['homework_main', '/homework'],
            [tdoc.title, `/homework/${tid}`, true],
            [pdoc.title, `/homework/${tid}/p/${pid}`, true],
            ['homework_detail_problem_submit', null],
        ];
        this.response.template = 'problem_submit.html';
        this.response.body = {
            tdoc, pdoc, rdocs, tsdoc, udoc, attended, path,
        };
    }

    async post({
        domainId, tid, pid, code, lang,
    }) {
        this.limitRate('add_record', 60, 100);
        const tsdoc = await contest.getStatus(domainId, tid, this.user._id, document.TYPE_HOMEWORK);
        if (!tsdoc.attend) throw new HomeworkNotAttendedError(tid);
        if (!contest.isOngoing(this.tdoc)) throw new HomeworkNotLiveError(tid);
        if (!this.tdoc.pids.includes(pid)) throw new ProblemNotFoundError(domainId, pid);
        const rid = await record.add(domainId, {
            pid, lang, code, uid: this.user._id, tid, hidden: true, ttype: document.TYPE_HOMEWORK,
        });
        await contest.updateStatus(domainId, tid, this.user._id,
            rid, pid, false, 0, document.TYPE_HOMEWORK);
        this.response.body = { tid, rid };
        if (this.canShowRecord(this.tdoc)) this.response.redirect = `/record/${rid}`;
    }
}

class HomeworkCreateHandler extends HomeworkHandler {
    async get() {
        const beginAt = new Date().delta({ day: 1 });
        const penaltySince = beginAt.delta({ day: 7 });
        const path = [
            ['homework_create', null],
        ];
        this.response.template = 'homework_edit.html';
        this.response.body = {
            path,
            dateBeginText: beginAt.format('%Y-%m-%d'),
            timeBeginText: '00:00',
            datePenaltyText: penaltySince.format('%Y-%m-%d'),
            timePenaltyText: '23:59',
            pids: '1000, 1001',
            extensionDays: 1,
            page_name: 'homework_create',
        };
    }

    async post({
        domainId, title, content, beginAtDate, beginAtTime,
        penaltySinceDate, penaltySinceTime, extensionDays,
        penaltyRules, pids,
    }) {
        let beginAt;
        let penaltySince;
        try {
            beginAt = new Date(Date.parse(`${beginAtDate} ${beginAtTime.replace('-', ':')}`));
        } catch (e) {
            throw new ValidationError('beginAtDate', 'beginAtTime');
        }
        try {
            penaltySince = new Date(Date.parse(`${penaltySinceDate} ${penaltySinceTime.replace('-', ':')}`));
        } catch (e) {
            throw new ValidationError('end_at_date', 'end_at_time');
        }
        const endAt = penaltySince.delta({ days: extensionDays });
        if (beginAt >= penaltySince) { throw new ValidationError('end_at_date', 'end_at_time'); }
        if (penaltySince > endAt) throw new ValidationError('extension_days');
        await this.verifyProblems(domainId, pids);
        const tid = await contest.add(domainId, title, content, this.user._id,
            'homework', beginAt, endAt, pids, { penaltySince, penaltyRules }, document.TYPE_HOMEWORK);
        this.response.body = { tid };
        this.response.redirect = `/homework/${tid}`;
    }
}

class HomeworkEditHandler extends HomeworkHandler {
    async get({ domainId, tid }) {
        const tdoc = await contest.get(domainId, tid, document.TYPE_HOMEWORK);
        if (tdoc.owner !== this.user._id) this.checkPerm(PERM_EDIT_HOMEWORK);
        const extensionDays = Math.round(
            (tdoc.endAt.getTime() - tdoc.penaltySince.getTime()) / 36000 / 24,
        ) / 100;
        const path = [
            ['homework_main', '/homework'],
            [tdoc.title, `/homework/${tid}`, true],
            ['homework_edit', null],
        ];
        this.response.template = 'homework_edit.html';
        this.response.body = {
            tdoc,
            dateBeginText: tdoc.beginAt.format('%Y-%m-%d'),
            timeBeginText: tdoc.beginAt.format('%H:%M'),
            datePenaltyText: tdoc.penaltySince.format('%Y-%m-%d'),
            timePenaltyText: tdoc.penaltySince.format('%H:%M'),
            extensionDays,
            penaltyRules: _formatPenaltyRules(tdoc.penaltyRules),
            pids: tdoc.pids.join(','),
            path,
        };
    }

    async post({
        domainId, title, content, beginAtDate, beginAtTime,
        penaltySinceDate, penaltySinceTime, extensionDays,
        penaltyRules, pids, tid,
    }) {
        const tdoc = await contest.get(domainId, tid, document.TYPE_HOMEWORK);
        if (tdoc.owner !== this.user._id) this.checkPerm(PERM_EDIT_HOMEWORK);
        let beginAt;
        let penaltySince;
        try {
            beginAt = new Date(Date.parse(`${beginAtDate} ${beginAtTime.replace('-', ':')}`));
        } catch (e) {
            throw new ValidationError('beginAtDate', 'beginAtTime');
        }
        try {
            penaltySince = new Date(Date.parse(`${penaltySinceDate} ${penaltySinceTime.replace('-', ':')}`));
        } catch (e) {
            throw new ValidationError('endAtDate', 'endAtTime');
        }
        const endAt = penaltySince.delta({ days: extensionDays });
        if (beginAt >= penaltySince) throw new ValidationError('end_at_date', 'end_at_time');
        await this.verifyProblems(domainId, pids);
        await contest.edit(domainId, tid, {
            title, content, beginAt, endAt, pids, penaltySince, penaltyRules,
        }, document.TYPE_HOMEWORK);
        if (tdoc.beginAt !== beginAt
            || tdoc.endAt !== endAt
            || tdoc.penaltySince !== penaltySince
            || new Set(tdoc.pids) !== new Set(pids)) {
            await contest.recalcStatus(domainId, document.TYPE_HOMEWORK, tdoc.docId);
        }
        this.response.body = { tid };
        this.response.redirect = `/homework/${tid}`;
    }
}

async function apply() {
    contest.isHomeWorkExtended = (tdoc) => {
        const now = new Date().getTime();
        return tdoc.penaltySince.getTime() <= now && now < tdoc.endAt.getTime();
    };
    contest.RULES.homework = {
        TEXT: 'Assignment',
        check: () => { },
        stat: (tdoc, journal) => {
            const effective = {};
            for (const j of journal) {
                if (tdoc.pids.includes(j.pid)
                    && !effective.includes(j.pid)
                    && effective[j.pid].accept) {
                    effective[j.pid] = j;
                }
            }
            function time(jdoc) {
                const real = jdoc.rid.generationTime - tdoc.beginAt.getTime() / 1000;
                return Math.floor(real);
            }
            function penaltyScore(jdoc) {
                const { score } = jdoc;
                const exceedSeconds = Math.floor(
                    jdoc.rid.generationTime - tdoc.penaltySince.getTime() / 1000,
                );
                if (exceedSeconds < 0) return score;
                let coefficient = 1;
                const keys = Object.keys(tdoc.penaltyRules)
                    .map((k) => parseFloat(k)).sort((a, b) => a - b);
                for (const i of keys) {
                    if (i * 3600 <= exceedSeconds) coefficient = tdoc.penaltyRules[i];
                    else break;
                }
                return score * coefficient;
            }
            const detail = [];
            for (const j of effective) {
                detail.push({ ...j, penaltyScore: penaltyScore(j), time: time(j) });
            }
            return {
                score: Math.sum(detail.map((d) => d.score)),
                penaltyScore: Math.sum(detail.map((d) => d.penaltySince)),
                time: Math.sum(detail.map((d) => d.time)),
                detail,
            };
        },
        showScoreboard(tdoc, now) {
            return now > tdoc.endAt;
        },
        showRecord(tdoc, now) {
            return now > tdoc.endAt;
        },
        scoreboard(isExport, _, tdoc, rankedTsdocs, udict, pdict) {
            const columns = [
                { type: 'rank', value: _('Rank') },
                { type: 'user', value: _('User') },
                { type: 'total_score', value: _('Total Score') },
            ];
            for (const i in tdoc.pids) {
                if (isExport) {
                    columns.push({
                        type: 'problem_score',
                        value: '#{0} {1}'.format(i + 1, pdict[tdoc.pids[i]].title),
                    });
                } else {
                    columns.push({
                        type: 'problem_detail',
                        value: '#{0}'.format(i + 1),
                        raw: pdict[tdoc.pids[i]],
                    });
                }
            }
            const rows = [columns];
            for (const [rank, tsdoc] of rankedTsdocs) {
                const tsddict = {};
                if (tsdoc.journal) { for (const item of tsdoc.journal) tsddict[item.pid] = item; }
                const row = [];
                row.push({ type: 'string', value: rank });
                row.push({ type: 'user', value: udict[tsdoc.uid].uname, raw: udict[tsdoc.uid] });
                row.push({ type: 'string', value: tsdoc.score || 0 });
                for (const pid of tdoc.pids) {
                    row.push({
                        type: 'record',
                        value: (tsddict[pid] || {}).score || '-',
                        raw: (tsddict[pid] || {}).rid || null,
                    });
                }
                rows.push(row);
            }
            return rows;
        },
        rank: (tdocs) => ranked(tdocs, (a, b) => a.score === b.score),
    };
    Route('/homework', HomeworkMainHandler, PERM_VIEW_HOMEWORK);
    Route('/homework/create', HomeworkCreateHandler, PERM_CREATE_HOMEWORK);
    Route('/homework/:tid', HomeworkDetailHandler, PERM_VIEW_HOMEWORK);
    Route('/homework/:tid/p/:pid', HomeworkDetailProblemHandler, PERM_VIEW_HOMEWORK);
    Route('/homework/:tid/p/:pid/submit', HomeworkDetailProblemSubmitHandler, PERM_SUBMIT_PROBLEM);
    Route('/homework/:tid/edit', HomeworkEditHandler);
}

global.Hydro.handler.homework = {
    HomeworkMainHandler,
    HomeworkCreateHandler,
    HomeworkDetailHandler,
    HomeworkDetailProblemHandler,
    HomeworkDetailProblemSubmitHandler,
    HomeworkEditHandler,
    apply,
};

/*

@app.route('/homework/{tid:\w{24}}/code', 'homework_code')
class HomeworkCodeHandler(base.OperationHandler):
  @base.limit_rate('homework_code', 3600, 60)
  @base.route_argument
  @base.require_perm(builtin.PERM_VIEW_HOMEWORK)
  @base.require_perm(builtin.PERM_READ_RECORD_CODE)
  @base.sanitize
  async def get(this, *, tid: objectid.ObjectId):
    tdoc, tsdocs = await contest.get_and_list_status(domainId, document.TYPE_HOMEWORK, tid)
    rnames = {}
    for tsdoc in tsdocs:
      for pdetail in tsdoc.get('detail', []):
        rnames[pdetail['rid']] = 'U{}_P{}_R{}'.format(tsdoc['uid'], pdetail['pid'], pdetail['rid'])
    output_buffer = io.BytesIO()
    zip_file = zipfile.ZipFile(output_buffer, 'a', zipfile.ZIP_DEFLATED)
    rdocs = record.get_multi(get_hidden=True, _id={'$in': list(rnames.keys())})
    async for rdoc in rdocs:
      zip_file.writestr(rnames[rdoc['_id']] + '.' + rdoc['lang'], rdoc['code'])
    # mark all files as created in Windows :p
    for zfile in zip_file.filelist:
      zfile.create_system = 0
    zip_file.close()

    await this.binary(output_buffer.getvalue(), 'application/zip',
                      file_name='{}.zip'.format(tdoc['title']))


@app.route('/homework/{tid}/scoreboard', 'homework_scoreboard')
class HomeworkScoreboardHandler(contest.ContestMixin, base.Handler):
  @base.route_argument
  @base.require_perm(builtin.PERM_VIEW_HOMEWORK)
  @base.require_perm(builtin.PERM_VIEW_HOMEWORK_SCOREBOARD)
  @base.sanitize
  async def get(this, *, tid: objectid.ObjectId):
    tdoc, rows, udict = await this.get_scoreboard(document.TYPE_HOMEWORK, tid)
    page_title = this.translate('homework_scoreboard')
    path_components = this.build_path(
        (this.translate('homework_main'), this.reverse_url('homework_main')),
        (tdoc['title'], this.reverse_url('homework_detail', tid=tdoc['docId'])),
        (page_title, None))
    dudict = await domain.get_dict_user_by_uid(domain_id=domainId, uids=udict.keys())
    this.render('contest_scoreboard.html', tdoc=tdoc, rows=rows, dudict=dudict,
                page_title=page_title, path_components=path_components)


@app.route('/homework/{tid}/scoreboard/download/{ext}', 'homework_scoreboard_download')
class HomeworkScoreboardDownloadHandler(contest.ContestMixin, base.Handler):
  def _export_status_as_csv(this, rows):
    # \r\n for notepad compatibility
    csv_content = '\r\n'.join([','.join([str(c['value']) for c in row]) for row in rows])
    data = '\uFEFF' + csv_content
    return data.encode()

  def _export_status_as_html(this, rows):
    return this.render_html('contest_scoreboard_download_html.html', rows=rows).encode()

  @base.route_argument
  @base.require_perm(builtin.PERM_VIEW_HOMEWORK)
  @base.require_perm(builtin.PERM_VIEW_HOMEWORK_SCOREBOARD)
  @base.sanitize
  async def get(this, *, tid: objectid.ObjectId, ext: str):
    get_status_content = {
      'csv': this._export_status_as_csv,
      'html': this._export_status_as_html,
    }
    if ext not in get_status_content:
      raise error.ValidationError('ext')
    tdoc, rows, udict = await this.get_scoreboard(document.TYPE_HOMEWORK, tid, True)
    data = get_status_content[ext](rows)
    file_name = tdoc['title']
    await this.binary(data, file_name='{}.{}'.format(file_name, ext))
*/
