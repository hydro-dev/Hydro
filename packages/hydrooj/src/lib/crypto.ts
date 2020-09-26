import crypto from 'crypto';

const encrypt = (algorithm, content) => {
    const hash = crypto.createHash(algorithm);
    hash.update(content);
    return hash.digest('hex');
};

export const sha1 = (content: string) => encrypt('sha1', content);
export const md5 = (content: string) => encrypt('md5', content);

global.Hydro.lib.md5 = md5;
global.Hydro.lib.sha1 = sha1;
