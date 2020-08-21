import crypto from 'crypto';

function sha1(content: string) {
    const hash = crypto.createHash('sha1');
    hash.update(content);
    return hash.digest('hex');
}

global.Hydro.lib.sha1 = sha1;
export = sha1;
