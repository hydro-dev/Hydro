import {
    Context, db, ForbiddenError, PRIV, ContestModel, PERM, UserModel,
    ContestScoreboardHiddenError, Types, param, ProblemModel, ObjectId, Time,
    ContestNotLiveError, Counter, STATUS, Handler,
} from 'hydrooj';

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


export class ContestResolverHandler extends Handler {
    async get(domainId: string, tid: ObjectId) {
        this.response.template = 'resolver.html';
    }
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

    ctx.Route('resolver', '/resolver', ContestResolverHandler);
}
