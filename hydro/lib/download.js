const superagent = require('superagent');
const fs = require('fs');

async function _download(url, path, retry) {
    const w = fs.createWriteStream(path);
    await superagent.get(url).retry(retry).pipe(w);
    await new Promise((resolve, reject) => {
        w.on('finish', resolve);
        w.on('error', reject);
    });
    return path;
}

function download(url, path, retry = 3) {
    if (path) return _download(url, path, retry);
    return superagent.get(url).retry(retry);
}

global.Hydro.lib.download = module.exports = download;
