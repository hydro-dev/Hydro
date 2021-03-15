import { FilterQuery } from 'mongodb';
import { Pdoc } from 'hydrooj/dist/interface';
import * as problem from 'hydrooj/dist/model/problem';
import record from 'hydrooj/dist/model/record';
import user from 'hydrooj/dist/model/user';
import { PERM, PRIV } from 'hydrooj/dist/model/builtin';
import {
    Route, Handler, Types, post,
} from 'hydrooj/dist/service/server';

export class QueryProblemSetAPIHandler extends Handler {
    @post('locale', Types.String, true)
    @post('keyword', Types.String, true)
    @post('ownerId', Types.Int, true)
    @post('nonpublic', Types.Boolean, true)
    @post('tagsIds', Types.Array, true)
    @post('skipCount', Types.UnsignedInt, true)
    @post('takeCount', Types.UnsignedInt, true)
    async post(
        domainId: string, locale: string, $search: string,
        owner: number, nonpublic = false, tags = [],
        skip = 0, take = 0,
    ) {
        if (
            (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM))
            || (nonpublic && !this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN))
        ) {
            this.response.body = { error: 'PERMISSION_DENIED' };
            return;
        }
        const query: FilterQuery<Pdoc> = {};
        if ($search) query.$text = { $search };
        if (tags?.length) query.$and = tags.map((tag) => ({ tag }));
        if (owner) query.owner = owner;
        if (!nonpublic) query.hidden = false;
        const [raw, count] = await Promise.all([
            problem.getMulti(domainId, query).sort({ pid: 1, docId: 1 })
                .skip(skip).limit(take)
                .toArray(),
            problem.getMulti(domainId, query).count(),
        ]);
        const result = [];
        for (const doc of raw) {
            // eslint-disable-next-line no-await-in-loop
            const [rdoc] = await record
                .getUserInProblemMulti(domainId, this.user._id, doc.docId)
                .sort({ _id: -1 })
                .limit(1)
                .toArray();
            let locales = [];
            try {
                const ct = typeof doc.content === 'string' ? JSON.parse(doc.content) : doc.content;
                if (ct instanceof Array) locales = [this.session.viewLang || this.user.viewLang];
                else locales = Object.keys(ct);
            } catch (e) {
                locales = [this.session.viewLang || this.user.viewLang];
            }
            result.push({
                meta: {
                    id: doc.docId,
                    displayId: doc.pid,
                    type: 'Traditional',
                    isPublic: !doc.hidden,
                    publicTime: doc._id.getTimestamp(),
                    ownerId: doc.owner,
                    locales,
                    submissionCount: doc.nSubmit,
                    acceptedSubmissionCount: doc.nAccept,
                },
                title: doc.title,
                tags: [], // TODO
                resultLocale: this.session.viewLang || this.user.viewLang,
                submission: rdoc
                    ? {
                        id: rdoc._id,
                        isPublic: !doc.hidden,
                        codeLanguage: rdoc.lang,
                        answerSize: rdoc.code.length,
                        score: rdoc.score,
                        status: rdoc.status,
                        submitTime: rdoc._id.getTimestamp(),
                        timeUsed: rdoc.time,
                        memoryUsed: rdoc.memory,
                    }
                    : null,
            });
        }
        this.response.body = {
            result,
            count,
            permissions: {
                createProblem: this.user.hasPerm(PERM.PERM_CREATE_PROBLEM),
                manageTags: this.user.hasPerm(PERM.PERM_EDIT_PROBLEM),
                filterByOwner: this.user.hasPerm(PERM.PERM_VIEW_PROBLEM),
                filterNonpublic: this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN),
            },
        };
        if (owner) {
            const udoc = await user.getById(domainId, owner);
            this.response.body.filterOwner = {
                id: udoc._id,
                username: udoc.uname,
                email: udoc.mail,
                nickname: udoc.displayName || udoc.uname,
                bio: udoc.bio,
                avatar: {
                    type: 'gravatar',
                    key: udoc.gravatar,
                },
                isAdmin: udoc.hasPriv(PRIV.PRIV_MANAGE_ALL_DOMAIN) || udoc.hasPerm(PERM.PERM_ADMIN),
                acceptedProblemCount: udoc.nAccept,
                submissionCount: udoc.nSubmit,
                rating: udoc.rating,
                registrationTime: udoc.regat,
            };
        }
        if (tags) {
            this.response.body.filterTags = tags.map((tag) => ({
                id: tag,
                name: tag,
                color: '1',
                nameLocale: locale,
            }));
        }
    }
}

export async function apply() {
    Route('syzoj_api_problem_queryProblemSet', '/api/problem/queryProblemSet', QueryProblemSetAPIHandler);
}
