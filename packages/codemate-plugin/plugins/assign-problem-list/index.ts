import {
    ContestNotFoundError,
    type Context, Handler, moment, ObjectId, param, PenaltyRules, PERM,
    PermissionError,
    PRIV, ProblemModel as problem, SettingModel,
    Time,
    Types, ValidationError, yaml,
} from 'hydrooj';
import { GroupModel } from '../privilege-group/model';
import * as plist from './model';

export class SystemProblemListMainHandler extends Handler {
    parseTree(root: plist.SystemPList, all: plist.SystemPList[]) {
        if (!root.children?.length) return;
        const _children = [];
        for (const child of root.children) {
            const tdoc = all.find((d) => d._id === child);
            if (!tdoc) continue;
            this.parseTree(tdoc, all);
            _children.push(tdoc);
        }
        root.children = _children;
    }

    @param('page', Types.PositiveInt, true)
    async get(domainId: string) {
        const tdocs = await plist.getMulti(domainId).toArray();
        const roots = tdocs
            .filter((d) => d.parent === null)
            .map((d) => {
                this.parseTree(d, tdocs);
                return d;
            });
        this.response.body = { roots };
    }
}

export class SystemProblemListDetailHandler extends Handler {
    tdoc: plist.SystemPList;
    @param('tid', Types.ObjectId)
    async prepare(domainId: string, tid: ObjectId) {
        const tdoc = await plist.getWithChildren(domainId, tid);
        if (!tdoc) throw new ContestNotFoundError(tid, 'not found');
        if (tdoc.rule !== 'homework') throw new ContestNotFoundError(tid, 'not homework');
        this.tdoc = tdoc;
    }

    async get(domainId: string) {
        const pdict = await problem.getList(domainId, this.tdoc.pids, true, false, problem.PROJECTION_CONTEST_LIST);
        const hasPermission = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)
      || this.user.own(this.tdoc)
      || this.tdoc.assign?.map((g) => GroupModel.has(domainId, this.user._id, g)).some(Boolean);
        this.response.body = { tdoc: this.tdoc, pdict, hasPermission };
    }
}

export class SystemProblemListEditHandler extends Handler {
    prepare() {
        if (!this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) {
            throw new PermissionError();
        }
    }

    @param('tid', Types.ObjectId, true)
    async get(domainId: string, tid: ObjectId) {
        const tdoc = tid ? await plist.get(domainId, tid) : null;
        const extensionDays = tid
            ? Math.round(
                (tdoc.endAt.getTime() - tdoc.penaltySince.getTime()) / (Time.day / 100),
            ) / 100
            : 1;
        const beginAt = tid
            ? moment(tdoc.beginAt).tz(this.user.timeZone)
            : moment().subtract(1, 'day').tz(this.user.timeZone).hour(0).minute(0).millisecond(0);
        const penaltySince = tid
            ? moment(tdoc.penaltySince).tz(this.user.timeZone)
            : beginAt.clone().add(7, 'days').tz(this.user.timeZone).hour(23).minute(59).millisecond(0);
        this.response.template = 'system_plist_edit.html';
        this.response.body = {
            tdoc,
            dateBeginText: beginAt.format('YYYY-M-D'),
            timeBeginText: beginAt.format('H:mm'),
            datePenaltyText: penaltySince.format('YYYY-M-D'),
            timePenaltyText: penaltySince.format('H:mm'),
            extensionDays,
            penaltyRules: tid ? yaml.dump(tdoc.penaltyRules) : null,
            pids: tid ? tdoc.pids.join(',') : '',
            page_name: tid ? 'homework_edit' : 'homework_create',
        };
    }

    @param('tid', Types.ObjectId, true)
    @param('beginAtDate', Types.Date)
    @param('beginAtTime', Types.Time)
    @param('penaltySinceDate', Types.Date)
    @param('penaltySinceTime', Types.Time)
    @param('extensionDays', Types.Float)
    @param('penaltyRules', Types.Content)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('pids', Types.Content)
    @param('rated', Types.Boolean)
    @param('maintainer', Types.NumericArray, true)
    @param('assign', Types.CommaSeperatedArray, true)
    async postUpdate(
        domainId: string, tid: ObjectId, beginAtDate: string, beginAtTime: string,
        penaltySinceDate: string, penaltySinceTime: string, extensionDays: number,
        penaltyRules: PenaltyRules, title: string, content: string, _pids: string, rated = false,
        maintainer: number[] = [], assign: string[] = [],
    ) {
        const pids = _pids.replace(/，/g, ',').split(',').map((i) => +i).filter((i) => i);
        const beginAt = moment.tz(`${beginAtDate} ${beginAtTime}`, this.user.timeZone);
        const penaltySince = moment.tz(`${penaltySinceDate} ${penaltySinceTime}`, this.user.timeZone);
        const endAt = penaltySince.clone().add(extensionDays, 'days');
        const pdocs = await problem.getList(domainId, pids, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id, true);
        if (!tid) {
            tid = await plist.add(domainId, title, content, this.user._id,
                'homework', beginAt.toDate(), endAt.toDate(), pids, rated,
                { penaltySince: penaltySince.toDate(), penaltyRules, assign });
        } else {
            await plist.edit(domainId, tid, {
                title,
                content,
                beginAt: beginAt.toDate(),
                endAt: endAt.toDate(),
                pids,
                penaltySince: penaltySince.toDate(),
                penaltyRules,
                rated,
                maintainer,
                assign,
            });
        }
        await Promise.all(Object.values(pdocs).map((pdoc) => problem.edit(domainId, pdoc.docId, {
            assign: Array.from(new Set([...(pdoc.assign ?? []), ...assign])),
        })));
        this.response.body = { tid };
        this.response.redirect = this.url('system_problem_list_edit', { tid });
    }

    @param('tid', Types.ObjectId)
    async postDelete(domainId: string, tid: ObjectId) {
        const tdoc = await plist.get(domainId, tid);
        if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_HOMEWORK);
        await plist.del(domainId, tid);
        this.response.redirect = this.url('/');
    }
}

export async function apply(ctx: Context) {
    ctx.inject(['setting'], (c) => {
        c.setting.DomainSetting(SettingModel.Setting('setting_domain', 'tree_filters', '', 'json', 'HomePage Tree Filter'));
    });
    ctx.Route('system_problem_list_all', '/p-list', SystemProblemListMainHandler);
    ctx.Route('system_problem_list_create', '/p-list/create', SystemProblemListEditHandler);
    ctx.Route('system_problem_list_detail', '/p-list/:tid', SystemProblemListDetailHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('system_problem_list_edit', '/p-list/:tid/edit', SystemProblemListEditHandler);
}
