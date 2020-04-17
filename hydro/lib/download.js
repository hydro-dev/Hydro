const axios = require('axios');
const fs = require('fs');

async function download(url, path, retry = 3) {
    let r;
    try {
        const res = await axios.get(url, { responseType: 'stream' });
        if (path) {
            const w = await fs.createWriteStream(path);
            res.data.pipe(w);
            await new Promise((resolve, reject) => {
                w.on('finish', resolve);
                w.on('error', reject);
            });
        } else r = res.data;
    } catch (e) {
        if (retry) r = await download(url, path, retry - 1);
        else throw e;
    }
    return r;
}
module.exports = download;
