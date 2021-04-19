import { md5 } from './crypto';

type AvatarProvider = (src: string, size: number) => string;

export const providers: Record<string, AvatarProvider> = {
    gravatar: (email, size) => `//gravatar.loli.net/avatar/${md5((email || '').toString().trim().toLowerCase())}?d=mm&s=${size || 32}`,
    qq: (id) => `//q1.qlogo.cn/g?b=qq&nk=${/(\d+)/g.exec(id)[1]}&s=640`,
    github: (id, size) => `//github.com/${id}.png?size=${Math.min(size, 460)}`,
};

function avatar(src: string, size = 64) {
    const index = src.indexOf(':');
    if (index === -1) return providers.gravatar('', size);
    const [provider, str] = [src.substr(0, index), src.substr(index + 1, src.length)];
    if (!providers[provider] || !str) return providers.gravatar('', size);
    return providers[provider](str, size);
}

export default avatar;
global.Hydro.lib.avatar = avatar;
