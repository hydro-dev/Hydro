import { Context } from '../context';
import { ForbiddenError } from '../error';
import avatar from '../lib/avatar';
import { PRIV } from '../model/builtin';
import * as SystemModel from '../model/system';
import TokenModel from '../model/token';
import UserModel from '../model/user';
import { ConnectionHandler } from '../service/server';
import { Logger } from '../utils';

const logger = new Logger('connection');

class WebsocketEventsConnectionManagerHandler extends ConnectionHandler {
    category = '#gateway';
    private privileged = false;
    private channels: Set<string> = new Set();

    async prepare() {
        const secret = SystemModel.get('websocket.secret');
        const token = this.request.headers['x-hydro-websocket-gateway'];
        if (token) {
            if (!secret || token !== secret) throw new ForbiddenError('Invalid token');
            logger.info('Gateway websocket connection from %s', this.request.ip);
            this.privileged = true;
        }
        await this.ctx.parallel('subscription/init', this, this.privileged);
    }

    async accept(channel: string) {
        if (this.channels.has(channel)) return;
        this.channels.add(channel);
        await this.ctx.parallel('subscription/enable', channel, this, this.privileged);
    }

    async message(payload: any) {
        if (!['resume', 'subscribe'].includes(payload.operation)) return;
        const accept = [];
        const reject = [];
        const session = payload.credential
            ? await TokenModel.get(payload.credential, TokenModel.TYPE_SESSION)
            : null;
        const op = payload.operation || '';
        if (!session && op !== 'resume') return;
        if (op === 'resume' && !this.privileged) return;
        const user = op === 'resume' ? null : await UserModel.getById('system', session.uid);
        for (const channel of payload.channels || []) {
            try {
                const result = op === 'resume'
                    ? { ok: true, channel }
                    // eslint-disable-next-line no-await-in-loop
                    : await this.ctx.bail('subscription/subscribe', channel, user, this.privileged ? payload.metadata || {} : {});
                if (result?.ok) {
                    // eslint-disable-next-line no-await-in-loop
                    await this.accept(result.channel);
                    accept.push(result.channel);
                } else reject.push(channel);
            } catch (e) {
                logger.error('Error subscribing to channel %s for user %s: %s', channel, user?._id, e);
                reject.push(channel);
            }
        }
        this.send({
            operation: 'verify',
            accept,
            reject,
            connection_id: payload.connection_id,
        });
    }
}

export function apply(ctx: Context) {
    ctx.Connection('websocket_gateway', '/websocket', WebsocketEventsConnectionManagerHandler);

    async function notifyMessage(uid: number[], mdoc: any, h) {
        const udoc = (await UserModel.getById('system', mdoc.from))!;
        return {
            operation: 'event',
            channels: uid.map((u) => `message:${u}`),
            payload: { udoc: { ...udoc.serialize(h) as any, avatarUrl: avatar(udoc.avatar, 128) }, mdoc },
        };
    }

    ctx.on('subscription/init', (h, privileged) => {
        if (!privileged) return;
        h.ctx.on('user/message', async (uid, mdoc) => {
            h.send(await notifyMessage(uid, mdoc, h));
        });
    });

    ctx.on('subscription/enable', (channel, h, privileged) => {
        if (!channel.startsWith('message:') || privileged) return;
        const uid = +channel.split(':')[1];
        h.ctx.on('user/message', async (uids, mdoc) => {
            if (!uids.includes(uid)) return;
            h.send(await notifyMessage([uid], mdoc, h));
        });
    });

    ctx.on('subscription/subscribe', (channel, user) => { // eslint-disable-line consistent-return
        if (channel === 'message' && user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            return {
                ok: true,
                channel: `message:${user._id}`,
            };
        }
    });
}
