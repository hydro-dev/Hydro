import { Context } from '../context';
import avatar from '../lib/avatar';
import { PRIV } from '../model/builtin';
import * as SystemModel from '../model/system';
import TokenModel from '../model/token';
import UserModel from '../model/user';
import { ConnectionHandler } from '../service/server';

class WebsocketEventsConnectionManagerHandler extends ConnectionHandler {
    category = '#gateway';
    private privileged = false;
    private channels: Set<string> = new Set();

    async prepare() {
        const secret = SystemModel.get('websocket.secret');
        if (this.request.headers['x-hydro-websocket-gateway'] === secret) {
            this.privileged = true;
            this.ctx.on('user/message', async (uid, mdoc) => {
                await this.notifyMessage(uid, mdoc);
            });
        }
    }

    async notifyMessage(uid: number[], mdoc: any) {
        const udoc = (await UserModel.getById('system', mdoc.from))!;
        udoc.avatarUrl = avatar(udoc.avatar, 64);
        this.send({
            operation: 'event',
            channels: uid.map((u) => `message:${u}`),
            payload: { udoc, mdoc },
        });
    }

    async accept(channel: string) {
        if (this.channels.has(channel)) return;
        this.channels.add(channel);
        if (this.privileged) return;
        if (channel.startsWith('message:')) {
            const [, uid] = channel.split(':');
            this.ctx.on('user/message', async (uids, mdoc) => {
                if (!uids.includes(+uid)) return;
                await this.notifyMessage([+uid], mdoc);
            });
        }
    }

    async message(payload: any) {
        const success = [];
        const failed = [];
        const session = payload?.credential
            ? await TokenModel.get(payload.credential, TokenModel.TYPE_SESSION)
            : null;
        if (!session) return;
        const user = await UserModel.getById('system', session.uid);
        for (const channel of payload.channels) {
            if (channel === 'message' && user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
                success.push(`message:${user._id}`);
                // eslint-disable-next-line no-await-in-loop
                await this.accept(`message:${user._id}`);
                continue;
            }
            failed.push(channel);
        }
        if (success.length) {
            this.send({
                operation: 'accept',
                channels: success,
                connection_id: payload.connection_id,
            });
        }
        if (failed.length) {
            this.send({
                operation: 'reject',
                channels: failed,
                connection_id: payload.connection_id,
            });
        }
    }
}

export function apply(ctx: Context) {
    ctx.Connection('websocket_gateway', '/websocket', WebsocketEventsConnectionManagerHandler);
}
