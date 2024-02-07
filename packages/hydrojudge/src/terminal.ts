import log from './log';
import client from './sandbox/client';

export = async function terminal() {
    let resolve: (res?: any) => void;
    const promise = new Promise((r) => { resolve = r; });
    const version = await client.version();
    if (!version.stream) {
        log.info('no stream support, please upgrade hydro-sandbox to v1.8.1+');
        return;
    }
    process.stdin.setRawMode(true);
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
        log.info(result);
        resolve();
    });
    stream.on('open', async () => {
        let stop = false;
        process.stdin.on('data', (buf) => {
            if (buf.length === 1 && buf[0] === 3) {
                if (stop) stream.cancel();
                stop = true;
            } else stop = false;
            stream.input({ content: buf });
        });
        const resize = () => {
            stream.resize({
                rows: process.stdout.rows,
                cols: process.stdout.columns,
            });
        };
        process.stdout.on('resize', resize);
        resize();
    });
    stream.on('close', (e) => {
        log.info('close', e.code);
        resolve();
    });
    await promise;
    process.stdin.setRawMode(false);
    process.exit(0);
};
