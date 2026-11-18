# HGNU announcement image previews

Enable this addon after `@hydrooj/ui-default`. Discussion bodies use `markdownImages`, which renders and sanitizes Markdown and authored HTML first, then adds image optimization. Existing discussion content and original files do not need migration.

- The first body image loads normally; subsequent images use native lazy loading and asynchronous decoding.
- Public `/file/:uid/:filename` raster images get versioned 480/960/1600px WebP variants. Responsive selection follows the browser's viewport and pixel density. PNG previews use lossless WebP to preserve screenshot text. GIF, SVG, animated WebP/PNG, corrupt images, files over 32 MiB or 80 megapixels, external images, and restricted attachments keep their original URLs.
- Width/height and aspect ratio reserve space before loading, including existing percentage-width HTML images. Existing links keep their destinations; other previews link to the original in a new tab.
- Previews are generated on demand with two concurrent jobs and deduplicated requests. Cached files are outside the project under `~/.hydro/cache/image-preview`. The default disk budget is 512 MiB; an hourly sweep removes oldest excess files and files older than 30 days.
- Versioned preview responses have ETag and one-day caching. Each origin request verifies the live storage mapping, including deletion and replacement. Preview URLs cannot read problem/contest attachments or arbitrary storage paths.

When changing encoding parameters or the derivative format, increment `revision` in `images.ts` so existing browser and disk caches use new URLs.

The UI filter falls back to the usual Markdown renderer if the addon is disabled. Rollback consists of removing the addon from `.hydro/addon.json` and restarting OJ. The cache is disposable. To deploy to another machine, install dependencies from `yarn.lock` and enable the addon there.
