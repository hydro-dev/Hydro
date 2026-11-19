import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, readdir, rename, stat, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { load } from 'cheerio';
import { LRUCache } from 'lru-cache';
import sharp from 'sharp';

export const widths = [480, 960, 1600];
const maxBytes = 32 * 1024 * 1024;
const maxPixels = 80 * 1000 * 1000;
const revision = '1';

export interface Source {
    path: string;
    _id: string;
    link?: string;
    size?: number;
    etag?: string;
    lastModified?: Date;
}

export interface Dimensions {
    width: number;
    height: number;
    format: string;
}

// Only public user-file paths use this endpoint. Contest/problem attachments keep their access checks.
export function userFile(src: string) {
    if (!/^\/file\/\d+\/[^/?#]+$/.test(src)) return null;
    try {
        const path = `user/${decodeURIComponent(src.slice(6))}`;
        if (path.includes('..') || path.includes('\\') || path.split('/').length !== 3) return null;
        return path;
    } catch {
        return null;
    }
}

export function version(source: Source) {
    return createHash('sha256').update(JSON.stringify([
        revision, source.link || source._id, source.size, source.etag, source.lastModified,
    ])).digest('hex').slice(0, 24);
}

export class ImagePreviews {
    private metadata = new LRUCache<string, Promise<Dimensions | null>>({ max: 2048 });
    private pending = new Map<string, Promise<string>>();
    private active = 0;
    private waiting: (() => void)[] = [];

    constructor(public directory: string, private read: (source: Source) => Promise<Buffer>) {}

    private async limited<T>(fn: () => Promise<T>) {
        if (this.active >= 2) {
            if (this.waiting.length >= 64) throw new Error('Image preview queue is full');
            await new Promise<void>((resolve) => this.waiting.push(resolve));
        } else this.active++;
        try {
            return await fn();
        } finally {
            const next = this.waiting.shift();
            if (next) next();
            else this.active--;
        }
    }

    private async input(source: Source) {
        if (!source.size || source.size > maxBytes) throw new Error('Image exceeds preview size limit');
        const buffer = await this.read(source);
        if (buffer.length > maxBytes) throw new Error('Image exceeds preview size limit');
        return buffer;
    }

    async dimensions(source: Source) {
        const key = version(source);
        if (!this.metadata.has(key)) {
            const result = this.limited(async () => {
                if (source.size > maxBytes || !/\.(?:jpe?g|png|webp)$/i.test(source.path)) return null;
                const info = await sharp(await this.input(source), { limitInputPixels: maxPixels }).metadata();
                if (!['jpeg', 'png', 'webp'].includes(info.format) || (info.pages || 1) > 1 || !info.width || !info.height) return null;
                const swap = (info.orientation || 1) >= 5;
                return { width: swap ? info.height : info.width, height: swap ? info.width : info.height, format: info.format };
            }).catch(() => null);
            this.metadata.set(key, result);
        }
        return this.metadata.get(key);
    }

    async derivative(source: Source, width: number) {
        if (!widths.includes(width)) throw new Error('Unsupported preview width');
        const key = `${version(source)}-${width}`;
        const target = join(this.directory, `${key}.webp`);
        try {
            await stat(target);
            return target;
        } catch { /* Generate a missing derivative once, including simultaneous requests. */ }
        if (!this.pending.has(key)) {
            const work = (async () => {
                const info = await this.dimensions(source);
                if (!info) throw new Error('Unsupported image');
                return this.limited(async () => {
                    const buffer = await this.input(source);
                    const output = await sharp(buffer, { limitInputPixels: maxPixels }).rotate()
                        .resize({ width, withoutEnlargement: true })
                        .webp({ quality: 84, lossless: info.format === 'png', effort: 4 }).toBuffer();
                    await mkdir(this.directory, { recursive: true });
                    const temporary = `${target}.${randomUUID()}.tmp`;
                    try {
                        await writeFile(temporary, output, { mode: 0o600 });
                        await rename(temporary, target);
                    } finally {
                        await unlink(temporary).catch(() => {});
                    }
                    return target;
                });
            })().finally(() => this.pending.delete(key));
            this.pending.set(key, work);
        }
        return this.pending.get(key);
    }

    async render(html: string, lookup: (paths: string[]) => Promise<Source[]>) {
        const $ = load(html, null, false);
        const images = $('img').toArray();
        const paths = [...new Set(images.map((img) => userFile($(img).attr('src') || '')).filter(Boolean))];
        const sources = new Map((paths.length ? await lookup(paths) : []).map((source) => [source.path, source]));
        // Keep metadata work bounded too: a long article must not create 94 concurrent image decoders.
        const dimensions = new Map<string, Dimensions>();
        const remaining = [...sources.values()];
        await Promise.all([0, 1].map(async () => {
            while (remaining.length) {
                const source = remaining.shift();
                const info = await this.dimensions(source); // eslint-disable-line no-await-in-loop
                if (info) dimensions.set(source.path, info);
            }
        }));
        for (const [i, element] of images.entries()) {
            const img = $(element);
            img.attr('loading', i === 0 ? 'eager' : 'lazy');
            img.attr('decoding', 'async');
            const src = img.attr('src') || '';
            const path = userFile(src);
            const source = sources.get(path);
            const info = dimensions.get(path);
            if (!source || !info) continue;
            const url = (width: number) => `${src}/preview/${width}/${version(source)}.webp`;
            const authoredWidth = img.attr('width');
            const authoredHeight = img.attr('height');
            const percent = /^\d+(?:\.\d+)?%$/.test(authoredWidth || '') ? Math.min(100, Number.parseFloat(authoredWidth)) : 100;
            img.attr('src', url(960));
            img.attr('srcset', widths.map((width) => `${url(width)} ${Math.min(width, info.width)}w`).filter((value, index, all) =>
                all.findIndex((other) => other.split(' ').at(-1) === value.split(' ').at(-1)) === index).join(', '));
            img.attr('sizes', `(max-width: 600px) ${percent}vw, (max-width: 1200px) ${Math.round(percent * 0.72)}vw, ${Math.round(percent * 8.4)}px`);
            if (!authoredWidth) img.attr('width', String(info.width));
            if (!authoredHeight) {
                img.attr('height', String(info.height));
                img.attr('style', `${img.attr('style') || ''};height:auto;aspect-ratio:${info.width}/${info.height}`);
            }
            // An existing link keeps its original destination (e.g. a linked poster).
            if (!img.closest('a').length) {
                img.wrap($('<a></a>').attr({ href: `${src}?noDisposition=true`, target: '_blank', rel: 'noopener', title: '查看原图' }));
            }
        }
        return $.html();
    }

    async prune(maxSize: number) {
        await mkdir(this.directory, { recursive: true });
        const entries = await readdir(this.directory);
        const files = (await Promise.all(entries.filter((file) => /^[a-f0-9]{24}-\d+\.webp$/.test(file)).map(async (file) => {
            const name = join(this.directory, file);
            return { name, ...await stat(name).catch(() => ({ size: 0, mtimeMs: 0 })) };
        }))).sort((a, b) => a.mtimeMs - b.mtimeMs);
        let total = files.reduce((sum, file) => sum + file.size, 0);
        for (const file of files) {
            if (total <= maxSize && Date.now() - file.mtimeMs < 30 * 86400 * 1000) continue;
            await unlink(file.name).catch(() => {}); // eslint-disable-line no-await-in-loop
            total -= file.size;
        }
    }

    stream(file: string) {
        return createReadStream(file);
    }
}
