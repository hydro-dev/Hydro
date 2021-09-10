import fs from 'fs';
import superagent, { SuperAgentRequest } from 'superagent';

async function _download(url: string, path: string, retry: number) {
    const w = fs.createWriteStream(path);
    superagent.get(url).retry(retry).pipe(w);
    await new Promise((resolve, reject) => {
        w.on('finish', resolve);
        w.on('error', reject);
    });
    return path;
}

function download(url: string): SuperAgentRequest;
function download(url: string, path?: string, retry = 3) {
    if (path) return _download(url, path, retry);
    return superagent.get(url).retry(retry);
}

export = download;

global.Hydro.lib.download = download;
