import { Context } from '../context';
import { ForbiddenError } from '../error';
import * as SystemModel from '../model/system';
import TokenModel from '../model/token';
import UserModel from '../model/user';
import { ConnectionHandler } from '../service/server';
import { Logger } from '../utils';

const logger = new Logger('connection');

class WebsocketEventsConnectionManagerHandler extends ConnectionHandler {
    noCheckPermView = true;
    category = '#gateway';
    private id = Math.random().toString(16).substring(2);
    private privileged = false;
    private channels: Set<string> = new Set();
    private disposables: Map<string, () => void> = new Map();

    async prepare() {
        const secret = SystemModel.get('websocket.secret');
        const token = this.request.headers['x-hydro-websocket-gateway'];
        if (token) {
            if (!secret || token !== secret) throw new ForbiddenError('Invalid token');
            logger.info('Gateway websocket connection from %s, id=%s', this.request.ip, this.id);
            this.privileged = true;
        }
        await this.ctx.parallel('subscription/init', this, this.privileged);
    }

    async accept(channel: string) {
        if (this.channels.has(channel)) return;
        this.channels.add(channel);
        const d: (() => void)[] = [];
        const disposeAll = () => {
            for (const dispose of d) dispose();
        };
        this.disposables.set(channel, disposeAll);
        await this.ctx.parallel('subscription/enable', channel, this, this.privileged, (disposable) => {
            d.push(disposable);
        });
    }

    async message(payload: any) {
        try {
            if (['resume', 'subscribe'].includes(payload.operation)) await this.subscribe(payload);
            if (payload.operation === 'unsubscribe') await this.unsubscribe(payload);
        } catch (e) {
            logger.error('Failed to process message %o: %o', payload, e);
        }
    }

    async unsubscribe(payload: any) {
        for (const channel of payload.channels || []) {
            try {
                if (!this.channels.has(channel)) continue;
                this.channels.delete(channel);
                this.disposables.get(channel)?.();
                this.disposables.delete(channel);
            } catch (e) {
                logger.error('Error unsubscribing from channel %s: %s', channel, e);
            }
        }
    }

    async subscribe(payload: any) {
        const accept = [];
        const reject = [];
        const session = payload.credential
            ? await TokenModel.get(payload.credential, TokenModel.TYPE_SESSION)
            : null;
        const op = payload.operation || '';
        if (op === 'resume' && !this.privileged) {
            this.send({ operation: 'resume_failed' });
            return;
        }
        const user = op === 'resume' ? null : await UserModel.getById('system', session?.uid || 0);
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
        if (op !== 'resume') {
            this.send({
                operation: 'verify',
                accept,
                reject,
                request_id: payload.request_id,
                subscription_id: payload.subscription_id,
            });
        }
    }

    async cleanup() {
        if (this.privileged) {
            logger.info('Gateway websocket disconnected from %s, id=%s', this.request.ip, this.id);
        }
    }
}

export function apply(ctx: Context) {
    ctx.Connection('websocket_gateway', '/websocket', WebsocketEventsConnectionManagerHandler);
}
