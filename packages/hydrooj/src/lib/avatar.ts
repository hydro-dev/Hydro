import { Types } from '@hydrooj/framework/validator';
import { md5 } from '../utils';

type AvatarProvider = (src: string, size: number) => string;

export const providers: Record<string, AvatarProvider> = {
    gravatar: (email, size) => `${global.Hydro.model.system.get('avatar.gravatar_url')}`
        + `${md5((email || '').toString().trim().toLowerCase())}?d=mm&s=${size || 32}`,
    qq: (id) => `//q1.qlogo.cn/g?b=qq&nk=${(/(\d+)/.exec(id) || ['', ''])[1]}&s=160`,
    github: (id, size) => `//github.com/${id}.png?size=${Math.min(size, 460)}`,
    url: (url) => url,
};

function avatar(src: string, size = 64, fallback = '') {
    src ||= fallback;
    let index = src.indexOf(':');
    if (index === -1 && fallback) {
        src = fallback;
        index = src.indexOf(':');
    }
    if (index === -1) return providers.gravatar('', size);
    const [provider, str] = [src.substring(0, index), src.substring(index + 1, src.length)];
    if (!providers[provider] || !str) return providers.gravatar('', size);
    return providers[provider](str, size);
}

export function validate(input: string) {
    if (!input) return true;
    if (input.startsWith('url:')) return true;
    if (input.startsWith('github:')) return /^[a-zA-Z0-9-]+$/.test(input.substring(7, input.length));
    if (input.startsWith('qq:')) return /^[1-9]\d{4,}$/.test(input.substring(3));
    if (input.startsWith('gravatar:')) return Types.Email[1](input.substring(9));
    return false;
}

export default avatar;
