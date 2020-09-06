import { } from 'hydrooj';
import * as bus from 'hydrooj/dist/service/bus';
import WebSocket from 'ws';

export async function postInit() {
    const { system, token } = global.Hydro.model;
    const [url, accessToken] = await system.getMany(['login-with-qq.url', 'login-with-qq.token']);
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
            resolve();
        });
    });
}

bus.once('app/started', postInit);
