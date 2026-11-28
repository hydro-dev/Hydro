/* eslint-disable no-await-in-loop -- Preserve the archive entry order. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { Zip } from 'hydrooj';

export async function presentationPackage(connection: { url: string, username: string, password: string, mode: string }) {
    const files = new Map<string, Buffer>([
        ['connection.json', Buffer.from(`${JSON.stringify(connection, null, 2)}\n`)],
        ['start-presentation.cmd', Buffer.from(readFileSync(join(__dirname, 'launcher/start-presentation.cmd'), 'utf8')
            .replace(/\r?\n/g, '\r\n'))],
        ['start-presentation.ps1', Buffer.from(`\uFEFF${readFileSync(join(__dirname, 'launcher/start-presentation.ps1'), 'utf8')
            .replace(/^\uFEFF/, '')}`)],
        ['使用说明.txt', Buffer.from([
            '下载并解压官方 ICPC Presentation Client，准备 64 位 Java 17 或更新版本。',
            '将客户端目录放在本包内，双击 start-presentation.cmd；也可按提示输入客户端目录。',
            '连接信息仅用于本场比赛公开展示，可在比赛管理中重置或停用。',
            '退出大屏按 Ctrl+Q。', '',
        ].join('\n'))],
    ]);
    const writer = new Zip.ZipWriter(new Zip.Uint8ArrayWriter());
    for (const [name, content] of files) await writer.add(name, new Zip.Uint8ArrayReader(content));
    return Buffer.from(await writer.close());
}
