/* eslint-disable no-await-in-loop */
import child from 'child_process';
import path from 'path';
import { CAC } from 'cac';
import fs from 'fs-extra';
import superagent from 'superagent';
import { findFileSync, Logger } from '@hydrooj/utils';

const logger = new Logger('patch');

function locateFile(file: string): string | null {
    const candidates = [file];
    if (file.startsWith('packages/')) {
        candidates.push(file.replace(/^packages\//, ''), file.replace(/^packages\//, '@hydrooj/'));
    }
    for (const candidate of candidates) {
        try {
            return findFileSync(candidate, false) || require.resolve(candidate);
        } catch (e) {
            const resolved = path.resolve(candidate);
            if (fs.existsSync(resolved)) return resolved;
        }
    }
    return null;
}

export function register(cli: CAC) {
    cli.command('patch <patchfile>')
        .option('--dry-run', 'Show what files would be patched without actually patching them')
        .option('-R, --revert', 'Revert the patch instead of applying it')
        .action(async (patch: string, options: { dryRun?: boolean, revert?: boolean }) => {
            let content = '';
            global.__DISABLE_HYDRO_DEPRECATION_WARNING__ = true;
            if (/^[a-f0-9]{40}$/.test(patch)) patch = `https://github.com/hydro-dev/Hydro/commit/${patch}.patch`;
            if (patch.startsWith('http')) {
                const res = await superagent.get(patch).responseType('arraybuffer');
                logger.info('Downloaded patch');
                content = res.body.toString();
            } else content = await fs.readFile(patch, 'utf-8');
            const lines = content.split('\n');
            const filePatches: { filename: string, startLine: number, endLine: number }[] = [];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith('diff --git')) {
                    const match = line.match(/diff --git a\/(.+?) b\/(.+?)(?:\s|$)/);
                    if (!match) continue;
                    const filename = match[2];
                    const startLine = i;
                    let endLine = lines.length;
                    for (let j = i + 1; j < lines.length; j++) {
                        if (lines[j].startsWith('diff --git')) {
                            endLine = j;
                            break;
                        }
                    }
                    filePatches.push({ filename, startLine, endLine });
                }
            }
            if (!filePatches.length) {
                logger.error('No valid patches found in %s', patch);
                return;
            }
            logger.info('Found %d file(s) to %s', filePatches.length, options.revert ? 'revert' : 'patch');
            if (options.dryRun) logger.info('DRY RUN MODE - No files will be modified');
            for (const filePatch of filePatches) {
                const { filename, startLine, endLine } = filePatch;
                logger.info(options.revert ? 'Reverting %s' : 'Patching %s', filename);
                const filepath = locateFile(filename);
                if (!filepath) {
                    logger.error('File %s not found', filename);
                    continue;
                }
                if (options.dryRun) for (let i = startLine; i < endLine; i++) logger.info(lines[i]);
                else {
                    const tempPatchFile = `${filepath}.tmp.patch`;
                    const filePatchLines = lines.slice(startLine, endLine);
                    await fs.writeFile(tempPatchFile, `${filePatchLines.join('\n')}\n`);
                    try {
                        child.execSync(`patch "${filepath}" -o "${filepath}.tmp"${options.revert ? ' -R' : ''} < "${tempPatchFile}"`);
                        await fs.move(`${filepath}.tmp`, filepath, { overwrite: true });
                        logger.success('%s %s', options.revert ? 'Reverted' : 'Patched', filename);
                    } catch (e) {
                        logger.error('Failed to patch %s: %s', filename, e.message);
                        logger.error(e.stdout.toString());
                    } finally {
                        if (fs.existsSync(tempPatchFile)) fs.unlinkSync(tempPatchFile);
                        if (fs.existsSync(`${filepath}.tmp`)) fs.unlinkSync(`${filepath}.tmp`);
                    }
                }
            }
            logger.info(`${options.dryRun ? 'Dry-run' : options.revert ? 'Revert' : 'Patch'} completed`);
        });
}
