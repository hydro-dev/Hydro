import { md5 } from './crypto';

type AvatarProvider = (src: string, size: number) => string;

export const providers: Record<string, AvatarProvider> = {
    gravatar: (email, size) => `${global.Hydro.model.system.get('avatar.gravatar_url')}`
    + `${md5((email || '').toString().trim().toLowerCase())}?d=mm&s=${size || 32}`,
    qq: (id) => `//q1.qlogo.cn/g?b=qq&nk=${(/(\d+)/g.exec(id) || ['', ''])[1]}&s=160`,
    github: (id, size) => `//github.com/${id}.png?size=${Math.min(size, 460)}`,
    url: (url) => url,
};

function avatar(src: string, size = 64, fallback = '') {
    src = src || fallback;
    let index = src.indexOf(':');
    if (index === -1) src = fallback;
    index = src.indexOf(':');
    if (index === -1) return providers.gravatar('', size);
    const [provider, str] = [src.substr(0, index), src.substr(index + 1, src.length)];
    if (!providers[provider] || !str) return providers.gravatar('', size);
    return providers[provider](str, size);
}

export default avatar;
global.Hydro.lib.avatar = avatar;
