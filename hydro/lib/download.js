const superagent = require('superagent');
const fs = require('fs');

async function download(url, path, retry = 3) {
    if (path) {
        const w = await fs.createWriteStream(path);
        await superagent.get(url).retry(retry).pipe(w);
        await new Promise((resolve, reject) => {
            w.on('finish', resolve);
            w.on('error', reject);
        });
        return path;
    }
    return superagent.get(url);
}

global.Hydro.lib.download = module.exports = download;
