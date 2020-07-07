import superagent from 'superagent';
import fs from 'fs';

async function _download(url: string, path: string, retry: number) {
    const w = fs.createWriteStream(path);
    superagent.get(url).retry(retry).pipe(w);
    await new Promise((resolve, reject) => {
        w.on('finish', resolve);
        w.on('error', reject);
    });
    return path;
}

export default function download(url: string, path: string | undefined | null, retry = 3) {
    if (path) return _download(url, path, retry);
    return superagent.get(url).retry(retry);
}

global.Hydro.lib.download = download;
