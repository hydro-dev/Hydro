/* eslint-disable no-await-in-loop -- Retry credential creation and migration after a competing atomic update. */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';

const digest = (value: any) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const accessId = (domainId: string, contestId: string) => JSON.stringify([domainId, contestId]);
const aad = (credential: any) => Buffer.from(JSON.stringify([credential._id, credential.generation, credential.username]));
const keyFor = (secret: string) => createHash('sha256').update('HGNUOJ Presentation credentials v1\0').update(secret).digest();
const keyId = (key: Buffer) => createHash('sha256').update(key).digest('hex').slice(0, 16);

export function matchesPassword(credential: any, password: string) {
    if (!credential || !/^[a-f0-9]{64}$/.test(password || '')) return false;
    const actual = Buffer.from(digest([credential.generation, password]), 'hex');
    const hashes = [credential.passwordHash, ...(credential.legacyPasswordHashes || [])];
    let matched = 0;
    for (const hash of hashes) {
        if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) continue;
        matched |= Number(timingSafeEqual(Buffer.from(hash, 'hex'), actual));
    }
    return !!matched;
}

export function sealPassword(credential: any, password: string, secrets: string[]) {
    if (!secrets?.[0]) throw new Error('展示连接所需的服务器密钥未配置');
    const key = keyFor(secrets[0]); const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(credential));
    const value = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
    return { version: 1, key: keyId(key), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), value: value.toString('hex') };
}

export function openPassword(credential: any, secrets: string[]) {
    const box = credential.passwordBox;
    if (box?.version !== 1 || !/^[a-f0-9]{24}$/.test(box.iv) || !/^[a-f0-9]{32}$/.test(box.tag)
        || !/^[a-f0-9]{128}$/.test(box.value)) throw new Error('展示连接密码数据无效');
    const key = (secrets || []).filter(Boolean).map(keyFor).find((value) => keyId(value) === box.key);
    if (!key) throw new Error('无法读取展示连接密码，请检查服务器会话密钥配置');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'hex'));
    decipher.setAAD(aad(credential));
    decipher.setAuthTag(Buffer.from(box.tag, 'hex'));
    const password = Buffer.concat([decipher.update(Buffer.from(box.value, 'hex')), decipher.final()]).toString('utf8');
    if (!matchesPassword(credential, password)) throw new Error('展示连接密码校验失败');
    return password;
}

export class PresentationCredentials {
    private collection: any;
    private secrets: () => string[] | Promise<string[]>;

    constructor(collection: any, secrets: () => string[] | Promise<string[]>) {
        this.collection = collection;
        this.secrets = secrets;
    }

    private async create(domainId: string, contestId: string, owner: number, enabled = true) {
        const generation = randomBytes(6).toString('hex'); const password = randomBytes(32).toString('hex');
        const credential = { _id: accessId(domainId, contestId), domainId, contestId, generation,
            username: `live-${contestId}-${generation}`, passwordHash: digest([generation, password]),
            enabled, owner, updatedAt: new Date(), passwordBox: null };
        credential.passwordBox = sealPassword(credential, password, await this.secrets());
        return credential;
    }

    async ensure(domainId: string, contestId: string, owner: number, known?: any) {
        const key = accessId(domainId, contestId);
        for (let attempt = 0; attempt < 8; attempt++) {
            const credential = await this.collection.findOne({ _id: key });
            if (!credential) {
                try {
                    const created = await this.create(domainId, contestId, owner);
                    await this.collection.updateOne({ _id: key }, { $setOnInsert: created }, { upsert: true });
                } catch (error) { if (error.code !== 11000) throw error; }
                continue;
            }
            if (credential.passwordBox) return { credential, password: openPassword(credential, await this.secrets()) };
            const recovered = known?.key === key && known.username === credential.username && matchesPassword(credential, known.password);
            const password = recovered ? known.password : randomBytes(32).toString('hex');
            const update: any = { passwordHash: digest([credential.generation, password]),
                passwordBox: sealPassword(credential, password, await this.secrets()), updatedAt: new Date() };
            // Hash-only credentials cannot be decrypted. Keep their existing clients and feed cursors valid.
            if (!recovered) {
                update.legacyPasswordHashes = [...new Set([credential.passwordHash, ...(credential.legacyPasswordHashes || [])])];
            }
            await this.collection.updateOne({ _id: key, generation: credential.generation,
                passwordHash: credential.passwordHash, passwordBox: null }, { $set: update });
        }
        throw new Error('展示连接正在更新，请稍后重试');
    }

    async reset(domainId: string, contestId: string, owner: number) {
        const current = await this.collection.findOne({ _id: accessId(domainId, contestId) });
        const { _id, ...credential } = await this.create(domainId, contestId, owner, current?.enabled ?? true);
        await this.collection.updateOne({ _id }, { $set: credential, $unset: { legacyPasswordHashes: '' } }, { upsert: true });
        return this.ensure(domainId, contestId, owner);
    }

    async setEnabled(domainId: string, contestId: string, owner: number, enabled: boolean) {
        await this.ensure(domainId, contestId, owner);
        await this.collection.updateOne({ _id: accessId(domainId, contestId) }, { $set: { enabled, updatedAt: new Date() } });
    }
}
