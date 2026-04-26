import { Context, Handler, param, Types, BadRequestError, ValidationError, ui, PRIV } from 'hydrooj';

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

    // i18n: 简单加载中/英文词条
    ctx.i18n.load('zh', {
        'Exam': '考试',
        'Exams': '考试',
        'Exam Management': '考试管理',
        'Create Exam': '创建试卷',
        'Create / Edit Exam': '创建 / 编辑试卷',
        'No exams found.': '未找到试卷。',
        'Delete exam?': '确认删除试卷？',
        'Title': '标题',
        'Content': '内容',
        'Begin At (ISO)': '开始时间（ISO）',
        'End At (ISO)': '结束时间（ISO）',
        'Duration (minutes)': '持续时长（分钟）',
        'Problem IDs (comma separated)': '题目 ID（用逗号分隔）',
        'Save': '保存',
        'Cancel': '取消',
        'Exams': '试卷列表',
        'You have not started this exam yet. Click the button below to begin.': '您尚未开始考试。点击下方按钮开始。',
        'Start Exam Now': '立即开始考试',
        'Final Score': '最终得分',
        'Details': '详情',
        'Problem': '题目',
        'Score': '得分',
        'Status': '状态',
        'Rank': '排名',
        'Result': '成绩',
    });
    ctx.i18n.load('en', {
        'Exam': 'Exam',
        'Exams': 'Exams',
        'Exam Management': 'Exam Management',
        'Create Exam': 'Create Exam',
        'Create / Edit Exam': 'Create / Edit Exam',
        'No exams found.': 'No exams found.',
        'Delete exam?': 'Delete exam?',
        'Title': 'Title',
        'Content': 'Content',
        'Begin At (ISO)': 'Begin At (ISO)',
        'End At (ISO)': 'End At (ISO)',
        'Duration (minutes)': 'Duration (minutes)',
        'Problem IDs (comma separated)': 'Problem IDs (comma separated)',
        'Save': 'Save',
        'Cancel': 'Cancel',
        'Exams': 'Exams',
        'You have not started this exam yet. Click the button below to begin.': 'You have not started this exam yet. Click the button below to begin.',
        'Start Exam Now': 'Start Exam Now',
        'Final Score': 'Final Score',
        'Details': 'Details',
        'Problem': 'Problem',
        'Score': 'Score',
        'Status': 'Status',
        'Rank': 'Rank',
        'Result': 'Result',
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
            const tdocs = await (contestModel && contestModel.getMulti ? contestModel.getMulti({ rule: 'exam' }).toArray() : db.collection('contest').find({ rule: 'exam' }).toArray());
            this.response.template = 'exam_list.html';
            this.response.body = { tdocs };
        }
    }

    class ExamDetailHandler extends Handler {
        @param('eid', Types.ObjectId)
        async get(domainId: string, eid: any) {
            const contestModel: any = getModel('contest');
            let tdoc: any;
            if (contestModel && contestModel.get) tdoc = await contestModel.get(domainId, eid);
            else tdoc = await getModel('db').collection('contest').findOne({ _id: eid });
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

    // 管理后台 handlers（仅系统管理员可访问）
    class ExamAdminListHandler extends Handler {
        async get() {
            this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
            const contestModel: any = getModel('contest');
            const db = getModel('db');
            const tdocs = await (contestModel && contestModel.getMulti ? contestModel.getMulti({ rule: 'exam' }).toArray() : db.collection('contest').find({ rule: 'exam' }).toArray());
            this.response.template = 'admin/exam_admin_list.html';
            this.response.body = { tdocs };
        }
    }

    class ExamAdminEditHandler extends Handler {
        @param('eid', Types.ObjectId, true)
        async get(domainId: string, eid: any) {
            this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
            const contestModel: any = getModel('contest');
            const db = getModel('db');
            let tdoc = {} as any;
            if (eid) {
                if (contestModel && contestModel.get) tdoc = await contestModel.get(domainId, eid);
                else tdoc = await db.collection('contest').findOne({ _id: eid });
            }
            this.response.template = 'admin/exam_admin_edit.html';
            this.response.body = { tdoc };
        }

        @param('eid', Types.ObjectId, true)
        @param('title', Types.String)
        @param('content', Types.String, true)
        @param('beginAt', Types.String, true)
        @param('endAt', Types.String, true)
        @param('duration', Types.Int, true)
        @param('pids', Types.String, true)
        async post(domainId: string, eid: any, title: string, content: string, beginAt: string, endAt: string, duration: number, pids: string) {
            this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
            const contestModel: any = getModel('contest');
            const db = getModel('db');
            const payload: any = {
                title,
                content,
                beginAt: beginAt ? new Date(beginAt) : null,
                endAt: endAt ? new Date(endAt) : null,
                duration: duration || null,
                pids: pids ? pids.split(',').map((x) => x.trim()).filter((x) => x) : [],
                rule: 'exam',
                owner: this.user._id,
            };

            // 优先使用 contest model 的高层 API（如果存在），否则回退到直接操作 db
            try {
                if (eid) {
                    if (contestModel && contestModel.edit) {
                        // common signature: edit(domainId, tid, payload)
                        await contestModel.edit(domainId, eid, payload);
                    } else if (contestModel && contestModel.set) {
                        await contestModel.set(domainId, eid, payload);
                    } else if (contestModel && contestModel.update) {
                        await contestModel.update(domainId, eid, payload);
                    } else {
                        await db.collection('contest').updateOne({ _id: eid }, { $set: payload });
                    }
                } else {
                    if (contestModel && contestModel.add) {
                        // 尝试常见签名
                        try {
                            await contestModel.add(domainId, payload);
                        } catch (e) {
                            try { await contestModel.add(payload); } catch (e2) {
                                await db.collection('contest').insertOne(payload);
                            }
                        }
                    } else if (contestModel && contestModel.create) {
                        try {
                            await contestModel.create(domainId, payload);
                        } catch (e) {
                            try { await contestModel.create(payload); } catch (e2) {
                                await db.collection('contest').insertOne(payload);
                            }
                        }
                    } else {
                        await db.collection('contest').insertOne(payload);
                    }
                }
            } catch (err) {
                // 如果 model API 抛错，回退到 db 操作以保证功能可用
                if (eid) await db.collection('contest').updateOne({ _id: eid }, { $set: payload });
                else await db.collection('contest').insertOne(payload);
            }

            this.response.redirect = this.url('exam_admin');
        }
    }

    class ExamAdminDeleteHandler extends Handler {
        @param('eid', Types.ObjectId)
        async post(domainId: string, eid: any) {
            this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
            const contestModel: any = getModel('contest');
            const db = getModel('db');
            try {
                if (contestModel && contestModel.del) await contestModel.del(domainId, eid);
                else if (contestModel && contestModel.delete) await contestModel.delete(domainId, eid);
                else if (contestModel && contestModel.deleteOne) await contestModel.deleteOne(domainId, eid);
                else await db.collection('contest').deleteOne({ _id: eid });
            } catch (e) {
                await db.collection('contest').deleteOne({ _id: eid });
            }
            this.response.redirect = this.url('exam_admin');
        }
    }

    ctx.Route('exam_list', '/exam', ExamListHandler);
    ctx.Route('exam_detail', '/exam/:eid', ExamDetailHandler);
    ctx.Route('exam_start', '/exam/:tid/start', ExamStartHandler);
    ctx.Route('exam_problemlist', '/exam/:tid/problems', ExamProblemListHandler);
    ctx.Route('exam_submit', '/exam/:tid/submit/:pid', ExamSubmitHandler);
    ctx.Route('exam_end', '/exam/:tid/end', ExamEndHandler);
    ctx.Route('exam_result', '/exam/:tid/result', ExamResultHandler);

    // Admin routes
    ctx.Route('exam_admin', '/admin/exam', ExamAdminListHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('exam_admin_create', '/admin/exam/create', ExamAdminEditHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('exam_admin_edit', '/admin/exam/:eid/edit', ExamAdminEditHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('exam_admin_delete', '/admin/exam/:eid/delete', ExamAdminDeleteHandler, PRIV.PRIV_EDIT_SYSTEM);
}
