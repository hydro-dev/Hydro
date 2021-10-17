import WebSocket from 'ws';
import { } from 'hydrooj';
import * as bus from 'hydrooj/src/service/bus';

declare module 'hydrooj' {
    interface SystemKeys {
        'login-with-qq.id': string,
        'login-with-qq.url': string,
        'login-with-qq.token': string,
    }
}

export async function postInit() {
    const { system, token } = global.Hydro.model;
    const [url, accessToken] = system.getMany(['login-with-qq.url', 'login-with-qq.token']);
    if (!url) return;
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const socket = new WebSocket(url, { headers });
    socket.on('error', console.error);
    socket.on('message', async (message) => {
        const payload = JSON.parse(message.toString());
        if (payload.post_type !== 'message') return;
        if (payload.message.startsWith('login ')) {
            const secret = payload.message.split(' ')[1];
            await token.coll.updateOne(
                { secret, tokenType: token.TYPE_OAUTH },
                {
                    $set: {
                        email: `${payload.sender.user_id}@qq.com`,
                        username: payload.sender.nickname,
                    },
                },
            );
        }
    });
    await new Promise((resolve) => {
        socket.once('open', () => {
            resolve(null);
        });
    });
}

bus.once('app/started', postInit);
