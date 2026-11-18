import { stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import {
    Context, Handler, NotFoundError, param, Schema, Service, StorageModel, Types,
} from 'hydrooj';
import { ImagePreviews, Source, version, widths } from './images';

export const Config = Schema.object({
    cacheMiB: Schema.number().default(512).min(64).max(4096).description('Disk budget for regenerable image previews'),
});

export class ImagePreviewService extends Service {
    previews: ImagePreviews;

    constructor(ctx: Context, config: ReturnType<typeof Config>) {
        super(ctx, 'image-preview');
        this.previews = new ImagePreviews(join(homedir(), '.hydro/cache/image-preview'), async (source) => {
            const stream = await ctx.storage.get(source.link || source._id);
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of stream) {
                const buffer = Buffer.from(chunk);
                size += buffer.length;
                if (size > 32 * 1024 * 1024) {
                    stream.destroy();
                    throw new Error('Image exceeds preview size limit');
                }
                chunks.push(buffer);
            }
            return Buffer.concat(chunks);
        });
        const prune = () => this.previews.prune(config.cacheMiB * 1024 * 1024).catch((e) => ctx.logger.warn(e));
        ctx.on('app/ready', prune);
        ctx.interval(prune, 3600 * 1000);
    }

    render(html: string) {
        return this.previews.render(html, (paths) => StorageModel.coll.find({ path: { $in: paths }, autoDelete: null }).toArray());
    }
}

class ImagePreviewHandler extends Handler {
    noCheckPermView = true;
    notUsage = true;

    @param('uid', Types.PositiveInt)
    @param('filename', Types.Filename)
    @param('width', Types.Range(widths))
    @param('revision', Types.String)
    async get(domainId: string, uid: number, filename: string, width: number, revision: string) {
        const source: Source = await StorageModel.coll.findOne({ path: `user/${uid}/${filename}`, autoDelete: null });
        if (!source || revision !== `${version(source)}.webp`) throw new NotFoundError(filename);
        const service = this.ctx.get('image-preview') as ImagePreviewService;
        let file: string;
        try {
            file = await service.previews.derivative(source, width);
        } catch {
            // Unsupported/corrupt images and temporary conversion failures keep the original download working.
            this.response.redirect = this.url('fs_download', { uid, filename });
            this.response.addHeader('Cache-Control', 'no-store');
            return;
        }
        this.response.type = 'image/webp';
        // The framework's response.etag shortcut resets Cache-Control to just "public".
        const etag = `"${version(source)}-${width}"`;
        this.response.addHeader('ETag', etag);
        this.response.addHeader('Cache-Control', 'public, max-age=86400, immutable');
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        this.response.addHeader('Content-Length', String((await stat(file)).size));
        if (this.request.headers['if-none-match'] === etag) {
            this.response.status = 304;
            this.response.body = Buffer.alloc(0);
        } else this.response.body = service.previews.stream(file);
    }
}

export const inject = ['db', 'storage'];

export function apply(ctx: Context, config: ReturnType<typeof Config>) {
    if (process.env.HYDRO_CLI) return;
    ctx.plugin(ImagePreviewService, config);
    ctx.Route('image_preview', '/file/:uid/:filename/preview/:width/:revision', ImagePreviewHandler);
}
