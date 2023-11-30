import {
    Context, db, ForbiddenError, fs, param, superagent,
    SystemModel, Types, UserModel, ValidationError,
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

export function apply(ctx: Context) {
    ctx.on('handler/init', async (that) => {
        const iplogin = await coll.findOne({ _id: normalizeIp(that.request.ip) });
        if (iplogin) {
            that.user = await UserModel.getById(that.domain._id, iplogin.uid);
            if (!that.user) {
                that.user = await UserModel.getById(that.domain._id, 0);
                throw new ForbiddenError(`User ${iplogin.uid} not found`);
            }
            that.session.ipLoggedIn = true;
            that.session.uid = iplogin.uid;
            that.session.user = that.user;
        }
    });

    ctx.withHandlerClass('ContestDetailBaseHandler', (ContestDetailBaseHandler) => {
        class ContestPrintHandler extends ContestDetailBaseHandler {
            async get() {
                if (!SystemModel.get('onsite-toolkit.print_cmd')) throw new ForbiddenError('Print is not enabled');
                this.response.template = 'contest_print.html';
            }

            @param('tid', Types.ObjectId)
            @param('lang', Types.Name)
            @param('code', Types.Content, true)
            async post(domainId: string, tid: string, lang: string, code: string) {
                if (!SystemModel.get('onsite-toolkit.print_cmd')) throw new ForbiddenError('Print is not enabled');
                let filename = String.random(8);
                if (!code) {
                    const file = this.request.files?.file;
                    if (!file || file.size === 0) throw new ValidationError('code');
                    if (file.size > 65535) throw new ValidationError('file');
                    code = await fs.readFile(file.filepath, 'utf8');
                    filename = file.originalFilename;
                }
                const udoc = await UserModel.getById(domainId, this.user._id);
                try {
                    const result = await superagent.post(SystemModel.get('onsite-toolkit.print_cmd'))
                        .field('tname', udoc.displayName ? `${udoc.displayName}(${udoc.uname})` : udoc.uname)
                        .field('location', udoc.location)
                        .field('team', this.user._id)
                        .field('lang', lang)
                        .field('filename', filename)
                        .attach('file', Buffer.from(code), filename)
                        .send();
                    this.response.body = result.text;
                } catch (e) {
                    this.response.body = e.response.text;
                }
            }
        }
        ctx.Route('contest_print', '/contest/:tid/print', ContestPrintHandler);
    });
}
