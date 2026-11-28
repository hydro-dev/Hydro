import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';

export const pushScope = (domainId: string, contestId: string) => JSON.stringify([domainId, contestId]);
export const pushJobId = (scope: string, balloonId: string) => createHash('sha256').update(JSON.stringify([scope, balloonId])).digest('hex');
export const secretHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const newDeliveryToken = () => randomBytes(32).toString('hex');
export const retrySeconds = [5, 15, 45, 120, 300, 600, 600, 600];

export function matchesDeliveryToken(hash: string, token: unknown) {
    if (!/^[a-f0-9]{64}$/.test(hash || '') || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(secretHash(token), 'hex'));
}

export function pushBaseUrl(value: unknown) {
    if (typeof value !== 'string' || value.length > 500) throw new Error('请填写手机可以访问的 OJ 地址');
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch { throw new Error('OJ 地址格式无效'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
        || !['', '/'].includes(url.pathname)) throw new Error('OJ 地址应为完整的网站地址，不包含路径、参数或账号');
    return url.origin;
}

export function validPushSpt(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith('SPT_') && value.length >= 12 && value.length <= 512
        && !/\s/.test(value) && Array.from(value).every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127);
}

export class PushSecrets {
    constructor(private keys: () => Promise<string[]>) {}

    async seal(value: string, context: string) {
        const key = (await this.keys())[0]; const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', Buffer.from(secretHash(`HGNUOJ balloon push\0${key}`), 'hex'), iv);
        cipher.setAAD(Buffer.from(context));
        const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        return { version: 1, key: secretHash(key).slice(0, 16), iv: iv.toString('hex'),
            tag: cipher.getAuthTag().toString('hex'), value: ciphertext.toString('hex') };
    }

    async open(box: any, context: string) {
        const key = (await this.keys()).find((item) => secretHash(item).slice(0, 16) === box?.key);
        if (!key || box.version !== 1 || !/^[a-f0-9]{24}$/.test(box.iv || '') || !/^[a-f0-9]{32}$/.test(box.tag || '')
            || !/^(?:[a-f0-9]{2})+$/.test(box.value || '')) throw new Error('推送凭据无法解密，请联系管理员');
        const decipher = createDecipheriv('aes-256-gcm', Buffer.from(secretHash(`HGNUOJ balloon push\0${key}`), 'hex'), Buffer.from(box.iv, 'hex'));
        decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(box.tag, 'hex'));
        return Buffer.concat([decipher.update(Buffer.from(box.value, 'hex')), decipher.final()]).toString('utf8');
    }
}

export function nextPushRunner(runners: any[], lastUid: number | null) {
    const start = runners.findIndex((runner) => runner.uid === lastUid);
    for (let offset = 1; offset <= runners.length; offset++) {
        const runner = runners[(start + offset) % runners.length];
        if (runner.active) return runner;
    }
    return null;
}

export function deliveryLink(baseUrl: string, id: string, token: string) {
    return `${pushBaseUrl(baseUrl)}/balloon-delivery/${id}#${token}`;
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function pushMessage(job: any, view: any, baseUrl: string, token: string) {
    const url = deliveryLink(baseUrl, job._id, token);
    const location = [view.classroom, view.seat ? `座位 ${view.seat}` : ''].filter(Boolean).join(' ');
    const summary = Array.from(`${view.label} 题气球 · ${location ? `${location} · ` : ''}${view.className} ${view.team}`).slice(0, 80).join('');
    const content = `<h3>${escapeHtml(view.contestTitle)} · 待发气球</h3>`
        + `<p>参赛者：${escapeHtml(view.team)}<br>班级：${escapeHtml(view.className)}`
        + `<br>教室：${escapeHtml(view.classroom || '未填写')}<br>座位号：${escapeHtml(view.seat || '未填写')}`
        + `<br>题目：${escapeHtml(view.label)} · ${escapeHtml(view.colorName)}`
        + `<br>发放人：${escapeHtml(job.name)}</p><p><a href="${escapeHtml(url)}">查看并确认发放</a></p>`;
    return { summary, content, contentType: 2, url };
}

export async function sendWxPusher(spt: string, message: any, request: typeof fetch = fetch) {
    const response = await request('https://wxpusher.zjiecode.com/api/send/message/simple-push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error',
        body: JSON.stringify({ ...message, spt }), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`WxPusher HTTP ${response.status}`);
    let result;
    try {
        result = await response.json();
    } catch { throw new Error('WxPusher 返回了无效响应'); }
    if (result.code !== 1000 || result.success === false
        || (Array.isArray(result.data) && (!result.data.length || result.data.some((item) => item.code !== 1000)))) {
        throw new Error(`WxPusher 未确认接收：${Number.isSafeInteger(result.code) ? result.code : '无效返回码'}`);
    }
}
