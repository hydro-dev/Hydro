import {
    avatar, ContestModel, Context, db, ForbiddenError,
    ObjectId, PERM, STATUS, Time, UserModel,
} from 'hydrooj';
import { ResolverInput } from './interface';

interface IpLoginInfo {
    _id: string;
    uid: number;
}

declare module 'hydrooj' {
    interface Collections {
        iplogin: IpLoginInfo;
    }
}
const coll = db.collection('iplogin');

function normalizeIp(ip: string) {
    if (ip.startsWith('::ffff:')) return ip.slice(7);
    return ip;
}

export function apply(ctx: Context) {
    ctx.on('handler/init', async (that) => {
        const iplogin = await coll.findOne({ _id: normalizeIp(that.request.ip) });
        if (iplogin) {
            that.user = await UserModel.getById(that.domain._id, iplogin.uid);
            if (!that.user) {
                that.user = await UserModel.getById(that.domain._id, 0);
                throw new ForbiddenError(`User ${iplogin.uid}not found`);
            }
            that.session.ipLoggedIn = true;
            that.session.uid = iplogin.uid;
            that.session.user = that.user;
        }
    });

    ctx.inject(['scoreboard'], ({ scoreboard }) => {
        scoreboard.addView('resolver', 'Resolver', { tdoc: 'tdoc' }, {
            async display({ tdoc }) {
                if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
                const teams = await ContestModel.getMultiStatus(tdoc.domainId, { docId: tdoc.docId }).toArray();
                const udict = await UserModel.getList(tdoc.domainId, teams.map((i) => i.uid));
                const teamIds: Record<number, number> = {};
                for (let i = 1; i <= teams.length; i++) teamIds[teams[i - 1].uid] = i;
                const time = (t: ObjectId) => Math.floor((t.getTimestamp().getTime() - tdoc.beginAt.getTime()) / Time.second);
                const pid = (i: number) => String.fromCharCode(65 + i);
                const unknownSchool = this.translate('Unknown School');
                const submissions = teams.flatMap((i) => {
                    if (!i.journal) return [];
                    return i.journal.filter((s) => tdoc.pids.includes(s.pid)).map((s) => ({ ...s, uid: i.uid }));
                });
                this.response.body = {
                    payload: {
                        name: tdoc.title,
                        duration: Math.floor((new Date(tdoc.endAt).getTime() - new Date(tdoc.beginAt).getTime()) / 1000),
                        frozen: Math.floor((new Date(tdoc.endAt).getTime() - new Date(tdoc.lockAt).getTime()) / 1000),
                        problems: tdoc.pids.map((i, n) => ({ name: pid(n), id: i.toString() })),
                        teams: teams.map((t) => ({
                            id: t.uid.toString(),
                            name: udict[t.uid].uname,
                            avatar: avatar(udict[t.uid].avatar),
                            institution: udict[t.uid].school || unknownSchool,
                        })),
                        submissions: submissions.map((i) => ({
                            team: i.uid.toString(),
                            problem: i.pid.toString(),
                            verdict: i.status === STATUS.STATUS_ACCEPTED ? 'AC' : 'RJ',
                            time: time(i.rid),
                        })),
                    } as ResolverInput,
                };
                this.response.template = 'resolver.html';
            },
            supportedRules: ['acm'],
        });
    });
}
