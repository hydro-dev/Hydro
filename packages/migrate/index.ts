import { Context, md5, sha1 } from 'hydrooj';
import { apply as hustoj } from './scripts/hustoj';
import { apply as syzoj } from './scripts/syzoj';
import { apply as vijos } from './scripts/vijos';

const RE_MD5 = /^[\da-f]{32}$/;

export function apply(ctx: Context) {
    hustoj(ctx);
    vijos(ctx);
    syzoj(ctx);

    ctx.provideModule('hash', 'hust', ($password, $saved) => {
        $password = md5($password);
        if (RE_MD5.test($saved)) return $password === $saved;
        const $svd = Buffer.from($saved, 'base64').toString('hex');
        const $salt = Buffer.from($svd.substr(40), 'hex').toString();
        const $hash = Buffer.concat([
            Buffer.from(sha1($password + $salt), 'hex'),
            Buffer.from($salt),
        ]).toString('base64');
        if ($hash.trim() === $saved.trim()) return true;
        return false;
    });
    ctx.provideModule('hash', 'vj2', (password, salt, { uname }) => {
        const pmd5 = md5(password);
        const mixedSha1 = sha1(md5(uname.toLowerCase() + pmd5) + salt + sha1(pmd5 + salt));
        return `${Buffer.from(uname).toString('base64')}|${mixedSha1}`;
    });
    ctx.provideModule('hash', 'syzoj', (password: string) => md5(`${password}syzoj2_xxx`));

    ctx.i18n.load('zh', {
        'migrate from hustoj': '从 HustOJ 导入',
        'migrate from vijos': '从 Vijos 导入',
        'migrate from syzoj': '从 SYZOJ 导入',
    });
}
