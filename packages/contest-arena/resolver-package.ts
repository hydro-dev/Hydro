import { lookup } from 'dns/promises';
import { readFileSync } from 'fs';
import { get } from 'https';
import { BlockList } from 'net';
import { join } from 'path';
import { avatar, ContestModel, ProblemModel, RecordModel, SettingModel, UserModel, Zip } from 'hydrooj';
import { buildResolverData, resolverTeamId, resolverWindowsLauncher } from './resolver';
import { finalizedSnapshot } from './scoring';
import { avatarImage } from './scoreboard';

interface Image { bytes: Buffer; extension: string; mime: string }
const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
    ['224.0.0.0', 4], ['240.0.0.0', 4]] as [string, number][]) blocked.addSubnet(address, prefix);
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
const imageCache = new Map<string, { image: Image; expires: number }>();

/** Fetch only public HTTPS images, pinning DNS and checking every redirect. No session is sent. */
async function downloadImage(input: string, signal: AbortSignal, redirects = 0): Promise<Image> {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || redirects > 3) throw new Error('Invalid avatar URL');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await Promise.race([
        lookup(host, { all: true }),
        new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('Avatar timeout')), { once: true })),
    ]);
    if (!addresses.length || addresses.some((item) => item.family === 4 ? blocked.check(item.address)
        : !globalV6.check(item.address, 'ipv6') || blocked.check(item.address, 'ipv6'))) throw new Error('Non-public avatar address');
    signal.throwIfAborted();
    const address = addresses.find((item) => item.family === 4) || addresses[0];
    return new Promise<Image>((resolve, reject) => {
        const request = get(url, { signal, family: address.family, agent: false,
            lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
            headers: { Accept: 'image/png,image/jpeg', 'User-Agent': 'HGNUOJ-Resolver-Export' } }, (response) => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
                response.resume();
                downloadImage(new URL(response.headers.location, url).toString(), signal, redirects + 1).then(resolve, reject);
                return;
            }
            if (response.statusCode !== 200 || Number(response.headers['content-length'] || 0) > 512 * 1024) {
                response.resume(); reject(new Error('Avatar unavailable')); return;
            }
            const chunks: Buffer[] = []; let size = 0;
            response.on('error', reject);
            response.on('data', (chunk: Buffer) => {
                size += chunk.length;
                if (size > 512 * 1024) { response.destroy(new Error('Avatar too large')); return; }
                chunks.push(chunk);
            });
            response.on('end', () => {
                const bytes = Buffer.concat(chunks);
                if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
                    && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0
                    && bytes.readUInt32BE(16) <= 4096 && bytes.readUInt32BE(20) <= 4096) {
                    resolve({ bytes, extension: 'png', mime: 'image/png' });
                } else if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
                    resolve({ bytes, extension: 'jpg', mime: 'image/jpeg' });
                } else reject(new Error('Unsupported avatar image'));
            });
        });
        request.on('error', reject);
    });
}

async function accountImage(udoc: any, fallback: Image) {
    const source = avatarImage(udoc?.avatar ? avatar(udoc.avatar, 160) : '', udoc?.avatar?.startsWith('gravatar:'));
    if (!source.startsWith('https://')) return { image: fallback, fallback: true };
    const cached = imageCache.get(source);
    if (cached && cached.expires > Date.now()) return { image: cached.image, fallback: false };
    try {
        const image = await downloadImage(source, AbortSignal.timeout(5000));
        if (imageCache.size >= 256) imageCache.delete(imageCache.keys().next().value);
        imageCache.set(source, { image, expires: Date.now() + 3600000 });
        return { image, fallback: false };
    } catch { return { image: fallback, fallback: true }; }
}

export async function createResolverPackage(tdoc: any, freezeMinutes?: string | number) {
    const statuses = await ContestModel.getMultiStatus(tdoc.domainId, {
        docId: tdoc.docId, registrationCancelled: { $in: [true, false, null] },
    }).toArray();
    const records = await RecordModel.getMulti(tdoc.domainId, { contest: tdoc.docId })
        .project({ _id: 1, uid: 1, pid: 1, status: 1 }).toArray();
    if (!finalizedSnapshot(tdoc, statuses, records)) throw new Error('评测记录与比赛日志尚未同步，可能仍在重测；请评测完成后再导出');
    const ids = [...new Set(statuses.filter((row) => row.attend).flatMap((row) => [row.uid, ...(row.members || [])]))];
    const [users, problems] = await Promise.all([
        UserModel.getListForRender(tdoc.domainId, ids, false),
        ProblemModel.getList(tdoc.domainId, tdoc.pids, true, true, ProblemModel.PROJECTION_CONTEST_DETAIL),
    ]);
    const data = buildResolverData(tdoc, statuses, users, problems, SettingModel.langs, { freezeMinutes });
    const fallback: Image = { bytes: readFileSync(join(__dirname, 'frontend', 'hgnu-logo.png')), extension: 'png', mime: 'image/png' };
    const images = new Map<string, Image>(); let cursor = 0, fallbackCount = 0;
    await Promise.all(Array.from({ length: Math.min(6, data.rows.length) }, async () => {
        while (cursor < data.rows.length) {
            const row = data.rows[cursor++];
            const result = await accountImage(users[row.uid], fallback);
            if (result.fallback) fallbackCount++;
            images.set(resolverTeamId(row.uid), result.image);
        }
    }));
    const files = new Map<string, Buffer>([['contest/logo.png', fallback.bytes]]);
    for (const team of data.collections.teams) {
        const image = images.get(team.id);
        const photo = `teams/${team.id}/photo.${image.extension}`;
        const logo = `organizations/${team.organization_id}/logo.${image.extension}`;
        const ref = (path: string) => [{ href: path, filename: path.split('/').at(-1), mime: image.mime }];
        team.photo = ref(photo);
        data.collections.organizations.find((item) => item.id === team.organization_id).logo = ref(logo);
        files.set(photo, image.bytes); files.set(logo, image.bytes);
    }
    const json = (path: string, value: any) => files.set(path, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
    json('api.json', { version: '2026-01', version_url: 'https://ccs-specs.icpc.io/2026-01/contest_api', provider: { name: 'HGNUOJ' } });
    json('contest.json', data.contest); json('state.json', data.state);
    for (const [key, value] of Object.entries(data.collections)) json(`${key}.json`, value);
    files.set('event-feed.ndjson', Buffer.from(`${data.events.map((event) => JSON.stringify(event)).join('\n')}\n`));
    files.set('start-resolver.cmd', Buffer.from(resolverWindowsLauncher));
    json('hgnuoj-export.json', { ...data.manifest, account_images: images.size - fallbackCount, fallback_images: fallbackCount });
    files.set('使用说明.txt', Buffer.from([
        `${tdoc.title} — ICPC Tools Resolver 滚榜包`, '',
        '1. 下载 ICPC Tools Resolver 稳定版，展示电脑需要 Java 17 或更新版本。',
        '   官方下载：https://tools.icpc.global/resolver',
        '2. 将本 ZIP 完整解压到同一目录，例如 C:\\contest-data\\hgnu。',
        '3. Windows：双击本包的 start-resolver.cmd，输入官方 Resolver 的解压目录（其中包含 lib 文件夹）。',
        '   也可运行：start-resolver.cmd "C:\\tools\\resolver"。脚本已为本次启动设置微软雅黑，支持中文。',
        '   手动运行时先执行 set "ICPC_FONT=Microsoft YaHei"，再运行 resolver.bat "C:\\contest-data\\hgnu"。',
        '   Linux：ICPC_FONT="Noto Sans CJK SC" ./resolver.sh "/path/to/contest-data/hgnu"（需安装该字体）。',
        '   macOS：ICPC_FONT="PingFang SC" ./resolver.sh "/path/to/contest-data/hgnu"。',
        '4. 空格向前一步，b 向后一步，0 重开；使用 Resolver 自带快捷键调速。', '',
        `回放封榜时刻（UTC）：${data.manifest.freeze_at}`,
        data.freeze.replay ? '原比赛未设置封榜，本包使用默认的赛后回放时长。' : '本包沿用原比赛的封榜时刻。',
        '导出及滚榜均不会修改 OJ 的封榜、评测结果或 RP；滚完后由管理员按需解封比赛。',
        '金银铜牌按比赛编辑中的配置导出，零题选手和打星选手不获奖。',
        '打星选手的数据保留，但在 ICPC Resolver 正式排名与滚榜中隐藏。',
        '头像已打包用于离线展示；获取失败的头像使用黄冈师范学院校徽。',
        '滚榜显示名采用“班级-姓名”；原 OJ 账号资料保持不变。',
        '系统错误、取消、忽略及格式错误判定不参与计分；编译错误不计罚时。',
        '判定时间为赛后快照的占位时间，不用于还原评测机实际处理过程。',
        '同分同罚时且最后通过分钟相同的选手并列；工具可能按姓名调整并列行的展示顺序。',
        'hgnuoj-export.json 包含导出时的完整/封榜成绩，供结果核对。',
    ].join('\r\n')));
    const writer = new Zip.ZipWriter(new Zip.Uint8ArrayWriter());
    for (const [path, content] of files) await writer.add(path, new Zip.Uint8ArrayReader(content));
    return { bytes: Buffer.from(await writer.close()), manifest: data.manifest };
}
