import { Context, Handler, param, Types, BadRequestError, ValidationError, ui } from 'hydrooj';

function getModel(name: string) {
    // 更稳健的获取 model 的方式：优先使用 core.model / global.Hydro.model，再尝试其他变体
    try {
        const core: any = require('hydrooj');
        if (core?.model && core.model[name]) return core.model[name];
        if (core && core[name]) return core[name];
    } catch (e) {
        // ignore
    }
    if ((global as any).Hydro?.model?.[name]) return (global as any).Hydro.model[name];
    if ((global as any).hydro?.model?.[name]) return (global as any).hydro.model[name];
    return undefined;
}

export function apply(ctx: Context) {
    // 注入导航栏入口，访客可见
    ctx.injectUI('Nav', 'exam_list', () => ({ icon: 'assignment', displayName: 'Exam', args: {} }));

    ctx.on('app/ready', () => {
        const contestModel: any = getModel('contest');
        if (!contestModel) return;
        contestModel.RULES = contestModel.RULES || {};
        contestModel.RULES.exam = {
            TEXT: 'Exam',
            hidden: false,
            check: () => { },
            submitAfterAccept: false,
            statusSort: { score: -1 },
            showScoreboard: () => false,
            showSelfRecord: (tdoc: any, now: Date) => now > new Date(tdoc.endAt),
            showRecord: (tdoc: any, now: Date) => now > new Date(tdoc.endAt),
            stat: (tdoc: any, journal: any[]) => {
                const effective: Record<string, any> = {};
                for (const j of journal) {
                    const pidKey = String(j.pid);
                    if ((tdoc.pids || []).map((x: any) => String(x)).includes(pidKey)) {
                        if (!effective[pidKey] || (effective[pidKey].score || 0) < (j.score || 0)) effective[pidKey] = j;
                    }
                }
                let score = 0;
                for (const pid of (tdoc.pids || [])) {
                    const key = String(pid);
                    if (effective[key]) score += effective[key].score || 0;
                }
                return { score, detail: effective };
            },
            scoreboard: async () => [[], {}],
            ranked: async (_: any, cursor: any) => {
                const result = await cursor.sort({ score: -1 }).toArray();
                return result.map((tsdoc: any, index: number) => [index + 1, tsdoc]);
            },
            applyProjection: (_: any, rdoc: any) => rdoc,
        };
        console.log('[Exam Plugin] 核心逻辑已加固');
    });

    // 路由与 Handler 定义
    abstract class ExamBase extends Handler {
        tdoc: any; tsdoc: any;
        contestModel = getModel('contest');
        problemModel = getModel('problem');
        db = getModel('db');

        @param('tid', Types.ObjectId)
        // 必须命名为 _prepare，框架会调用 _prepare 来提前加载 tdoc/tsdoc
        async _prepare(domainId: string, tid: any) {
            [this.tdoc, this.tsdoc] = await Promise.all([
                this.contestModel.get(domainId, tid),
                this.contestModel.getStatus(domainId, tid, this.user._id),
            ]);
            if (!this.tdoc || this.tdoc.rule !== 'exam') throw new ValidationError('rule');
            if (this.tsdoc?.endAt && !this.response.template?.includes('exam_result')) {
                return this.smartRedirect('result');
            }
        }

        // 彻底修复 // 双斜杠问题
        smartRedirect(target: string) {
            // 按照优先级尝试获取 domainId
            const dId = this.args?.domainId || this.domainId || this.tdoc?.domainId || 'system';
            const tid = this.tdoc?._id || this.args?.tid;
            this.response.redirect = `/d/${dId}/exam/${tid}/${target}`;
        }
    }

    class ExamListHandler extends Handler {
        async get() {
            // 获取所有 rule === 'exam' 的 contest（视为试卷）
            const contestModel: any = getModel('contest');
            const db = getModel('db');
            const tdocs = await contestModel.getMulti ? contestModel.getMulti({ rule: 'exam' }).toArray() : [];
            this.response.template = 'exam_list.html';
            this.response.body = { tdocs };
        }
    }

    class ExamDetailHandler extends Handler {
        @param('eid', Types.ObjectId)
        async get(domainId: string, eid: any) {
            const contestModel: any = getModel('contest');
            const tdoc = await contestModel.get(domainId, eid);
            if (!tdoc) throw new BadRequestError('Exam not found');
            this.response.template = 'exam_detail.html';
            this.response.body = { tdoc };
        }
    }

    class ExamStartHandler extends ExamBase {
        async get() {
            if (this.contestModel.isNotStarted(this.tdoc)) throw new BadRequestError('考试尚未开始');
            if (this.tsdoc?.startAt) return this.smartRedirect('problems');
            this.response.template = 'exam_start.html';
            this.response.body = { tdoc: this.tdoc };
        }
        async post() {
            const dId = this.args?.domainId || this.domainId || 'system';
            await this.db.collection('contest_status').updateOne(
                { domainId: dId, tid: this.tdoc._id, uid: this.user._id },
                { $set: { startAt: new Date(), attend: true } },
                { upsert: true }
            );
            return this.smartRedirect('problems');
        }
    }

    class ExamProblemListHandler extends ExamBase {
        async get() {
            if (!this.tsdoc?.startAt) return this.smartRedirect('start');

            // 计算有效结束时间（兼容 duration）
            const globalEnd = this.tdoc.endAt ? new Date(this.tdoc.endAt).getTime() : Infinity;
            let endAtTime = globalEnd;
            if (this.tdoc.duration && this.tsdoc.startAt) {
                endAtTime = Math.min(globalEnd, new Date(this.tsdoc.startAt).getTime() + this.tdoc.duration * 60 * 1000);
            }

            if (Date.now() > endAtTime && !this.tsdoc.endAt) {
                const dId = this.args?.domainId || this.domainId || 'system';
                await this.db.collection('contest_status').updateOne(
                    { domainId: dId, tid: this.tdoc._id, uid: this.user._id },
                    { $set: { endAt: new Date(endAtTime) } }
                );
                return this.smartRedirect('result');
            }

            // 确保域 ID 正确
            const dId = this.args?.domainId || this.domainId || 'system';
            const pids = this.tdoc.pids || [];
            const [pdocs, psdict] = await Promise.all([
                this.problemModel.getList(dId, pids),
                this.problemModel.getListStatus(dId, this.user._id, pids)
            ]);

            this.response.template = 'exam_problemlist.html';
            this.response.body = {
                tdoc: this.tdoc, tsdoc: this.tsdoc, pdocs, psdict,
                endAt: new Date(endAtTime).toISOString(),
                domainId: dId // 显式向前端传域 ID
            };
        }
    }

    class ExamSubmitHandler extends ExamBase {
        @param('pid', Types.String)
        async get(domainId: string, tid: any, pid: any) {
            // 兼容数字 id 的情况
            const dId = domainId || this.args?.domainId || this.domainId || this.tdoc?.domainId || 'system';
            const pdoc = await this.problemModel.get(dId, isNaN(+pid) ? pid : +pid);
            if (!pdoc) throw new BadRequestError(`题目 ${pid} 不存在。`);

            // 计算 endAt 与倒计时：与问题列表一致的逻辑
            const globalEnd = this.tdoc.endAt ? new Date(this.tdoc.endAt).getTime() : Infinity;
            let endAtTime = globalEnd;
            if (this.tdoc.duration && this.tsdoc.startAt) {
                endAtTime = Math.min(globalEnd, new Date(this.tsdoc.startAt).getTime() + this.tdoc.duration * 60 * 1000);
            }

            this.response.template = 'exam_submit.html';
            this.response.body = {
                tdoc: this.tdoc, tsdoc: this.tsdoc, pdoc,
                languages: ui.getLanguages(),
                lastLanguage: this.tsdoc?.detail?.[String(pdoc._id)]?.language || 'cpp',
                lastCode: this.tsdoc?.detail?.[String(pdoc._id)]?.code || '',
                domainId: dId,
                endAt: new Date(endAtTime).toISOString()
            };
        }

        @param('pid', Types.String)
        @param('language', Types.Name)
        @param('code', Types.String)
        async post(domainId: string, tid: any, pid: any, language: string, code: string) {
            const dId = domainId || this.args?.domainId || this.domainId || this.tdoc?.domainId || 'system';
            const pdoc = await this.problemModel.get(dId, isNaN(+pid) ? pid : +pid);
            if (!pdoc) throw new BadRequestError('题目不存在');
            await this.contestModel.submit(dId, this.tdoc._id, pdoc._id, this.user._id, language, code);
            return this.smartRedirect('problems');
        }
    }

    class ExamEndHandler extends ExamBase {
        async get() {
            const dId = this.args?.domainId || this.domainId || 'system';
            await this.db.collection('contest_status').updateOne(
                { domainId: dId, tid: this.tdoc._id, uid: this.user._id },
                { $set: { endAt: new Date() } }
            );
            return this.smartRedirect('result');
        }
    }

    class ExamResultHandler extends ExamBase {
        async get() {
            const dId = this.args?.domainId || this.domainId || 'system';
            if (!this.tsdoc?.endAt) throw new BadRequestError('尚未交卷');
            const [rows, pdocList] = await Promise.all([
                this.contestModel.getScoreboard.call(this, dId, this.tdoc._id, { isExport: false }),
                this.problemModel.getList(dId, this.tdoc.pids)
            ]);
            const pdocs = Object.fromEntries((pdocList || []).map((p: any) => [String(p._id), p]));
            this.response.template = 'exam_result.html';
            this.response.body = {
                tdoc: this.tdoc, tsdoc: this.tsdoc, pdocs,
                ranked: (rows && rows[0]) ? (rows[0].findIndex((r: any) => r.find((c: any) => String(c.raw) === String(this.user._id))) + 1) : 0,
                totalParticipants: (rows && rows[0]) ? rows[0].length : 0,
            };
        }
    }

    ctx.Route('exam_list', '/exam', ExamListHandler);
    ctx.Route('exam_detail', '/exam/:eid', ExamDetailHandler);
    ctx.Route('exam_start', '/exam/:tid/start', ExamStartHandler);
    ctx.Route('exam_problemlist', '/exam/:tid/problems', ExamProblemListHandler);
    ctx.Route('exam_submit', '/exam/:tid/submit/:pid', ExamSubmitHandler);
    ctx.Route('exam_end', '/exam/:tid/end', ExamEndHandler);
    ctx.Route('exam_result', '/exam/:tid/result', ExamResultHandler);
}
