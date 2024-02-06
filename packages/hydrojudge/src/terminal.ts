import { sleep } from '@hydrooj/utils';
import client from './sandbox/client';

export = async function terminalDemo() {
    console.log('start');
    let resolve: (res?: any) => void;
    const promise = new Promise((r) => { resolve = r; });
    const version = await client.version();
    if (!version.stream) {
        console.log('no stream support');
        return;
    }
    const stream = client.stream({
        cmd: [{
            args: ['/bin/bash'],
            env: ['PATH=/usr/local/bin:/usr/bin:/bin', 'HOME=/tmp', `TERM=${process.env['TERM']}`],
            files: [{ streamIn: true }, { streamOut: true }, { streamOut: true }],
            cpuLimit: (20 * 1e9),
            clockLimit: (30 * 60 * 1e9),
            memoryLimit: (256 << 20),
            procLimit: 50,
            tty: true,
        }],
    });
    stream.on('output', (output) => {
        process.stdout.write(output.content);
    });
    stream.on('end', (result) => {
        console.log(result);
        resolve();
    });
    stream.on('open', async () => {
        await sleep(10);
        stream.input({ index: 0, fd: 0, content: Buffer.from('vi\n') });
        await sleep(1000);
        stream.input({ index: 0, fd: 0, content: Buffer.from(':q\n') });
        await sleep(1000);
        stream.input({ index: 0, fd: 0, content: Buffer.from('ls /\n') });
        await sleep(1000);
        stream.input({ index: 0, fd: 0, content: Buffer.from('exit\n') });
    });
    stream.on('close', () => {
        console.log('close');
    });
    await promise;
};
