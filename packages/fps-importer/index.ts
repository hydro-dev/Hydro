/* eslint-disable no-await-in-loop */
import decodeHTML from 'decode-html';
import xml2js from 'xml2js';
import {
    _, AdmZip, buildContent, ContentNode, Context, FileTooLargeError, fs,
    Handler, PERM, ProblemConfigFile, ProblemModel, SolutionModel, ValidationError,
} from 'hydrooj';

class FpsProblemImportHandler extends Handler {
    async get() {
        this.response.template = 'problem_import.html';
    }

    async run(domainId: string, result: any) {
        for (const p of result.fps.item) {
            const content: ContentNode[] = [];
            if (p.description?.[0]) {
                content.push({
                    type: 'Text',
                    subType: 'html',
                    sectionTitle: this.translate('Description'),
                    text: p.description[0],
                });
            }
            if (p.input?.[0]) {
                content.push({
                    type: 'Text',
                    subType: 'html',
                    sectionTitle: this.translate('Input Format'),
                    text: p.input[0],
                });
            }
            if (p.output?.[0]) {
                content.push({
                    type: 'Text',
                    subType: 'html',
                    sectionTitle: this.translate('Output Format'),
                    text: p.output[0],
                });
            }
            if (p.sample_input?.length) {
                content.push(...p.sample_input.map((input, i) => ({
                    type: 'Sample',
                    sectionTitle: this.translate('Sample'),
                    payload: [input, p.sample_output[i]],
                })));
            }
            if (p.hint?.[0]) {
                content.push({
                    type: 'Text',
                    subType: 'html',
                    sectionTitle: this.translate('Hint'),
                    text: p.hint[0],
                });
            }
            const config: ProblemConfigFile = {
                time: p.time_limit[0]._ + p.time_limit[0].$.unit,
                memory: p.memory_limit[0]._ + p.memory_limit[0].$.unit,
            };
            const title = decodeHTML(p.title.join(' '));
            const tags = _.filter(p.source, (i: string) => i.trim());
            const pid = await ProblemModel.add(domainId, null, title, buildContent(content, 'html'), this.user._id, tags);
            await ProblemModel.addTestdata(domainId, pid, 'config.yaml', Buffer.from(`time: ${config.time}\nmemory: ${config.memory}`));
            if (p.test_output) {
                for (let i = 0; i < p.test_input.length; i++) {
                    const input = typeof p.test_input[i]?._ === 'string'
                        ? p.test_input[i]?._
                        : typeof p.test_input[i] === 'string'
                            ? p.test_input[i]
                            : '';
                    const output = typeof p.test_output[i]?._ === 'string'
                        ? p.test_output[i]?._
                        : typeof p.test_output[i] === 'string'
                            ? p.test_output[i]
                            : '';
                    await ProblemModel.addTestdata(domainId, pid, `${i + 1}.in`, Buffer.from(input));
                    await ProblemModel.addTestdata(domainId, pid, `${i + 1}.out`, Buffer.from(output));
                }
            } else if (p.test_input) {
                for (let i = 0; i < p.test_input.length / 2; i++) {
                    await ProblemModel.addTestdata(domainId, pid, `${i + 1}.in`, Buffer.from(p.test_input[2 * i]));
                    await ProblemModel.addTestdata(domainId, pid, `${i + 1}.out`, Buffer.from(p.test_input[2 * i + 1]));
                }
            }
            await ProblemModel.edit(domainId, pid, { html: true });
            if (p.solution) {
                let s = '';
                for (const sol of p.solution) {
                    s += `**${sol.$.language}** :  \n\`\`\`\n${sol._}\n\`\`\`\n`;
                }
                await SolutionModel.add(domainId, pid, this.user._id, s);
            }
        }
    }

    async post({ domainId }) {
        if (!this.request.files.file) throw new ValidationError('file');
        const tasks = [];
        try {
            const file = await fs.stat(this.request.files.file.filepath);
            if (file.size > 64 * 1024 * 1024) throw new FileTooLargeError('64m');
            const content = fs.readFileSync(this.request.files.file.filepath, 'utf-8');
            const result = await xml2js.parseStringPromise(content);
            tasks.push(result);
        } catch (e) {
            if (e instanceof FileTooLargeError) throw e;
            console.log(e);
            let zip: AdmZip;
            try {
                zip = new AdmZip(this.request.files.file.filepath);
            } catch (err) {
                throw new ValidationError('zip', null, err.message);
            }
            for (const entry of zip.getEntries()) {
                try {
                    const buf = entry.getData();
                    if (buf.byteLength > 64 * 1024 * 1024) throw new FileTooLargeError('64m');
                    const content = buf.toString();
                    const result = await xml2js.parseStringPromise(content);
                    tasks.push(result);
                } catch { }
            }
        }
        if (!tasks.length) throw new ValidationError('file', null, 'No valid fps format file found');
        for (const task of tasks) await this.run(domainId, task);
        this.response.redirect = this.url('problem_main');
    }
}

export const sideEffect = true;
export async function apply(ctx: Context) {
    ctx.Route('problem_import_fps', '/problem/import/fps', FpsProblemImportHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.inject('ProblemAdd', 'problem_import_fps', { icon: 'copy', text: 'From FPS File' });
}
