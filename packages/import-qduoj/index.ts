/* eslint-disable no-await-in-loop */
import os from 'os';
import path from 'path';
import {
    AdmZip, buildContent, ContentNode, Context, fs, Handler, PERM,
    ProblemConfigFile, ProblemModel, ValidationError, yaml,
} from 'hydrooj';

const tmpdir = path.join(os.tmpdir(), 'hydro', 'import-qduoj');
fs.ensureDirSync(tmpdir);

class ImportQduojHandler extends Handler {
    async fromFile(domainId: string, zipfile: string) {
        let zip: AdmZip;
        try {
            zip = new AdmZip(zipfile);
        } catch (e) {
            throw new ValidationError('zip', null, e.message);
        }
        const tmp = path.resolve(tmpdir, String.random(32));
        await new Promise((resolve, reject) => {
            zip.extractAllToAsync(tmp, true, (err) => (err ? reject(err) : resolve(null)));
        });
        let cnt = 0;
        try {
            const folders = await fs.readdir(tmp, { withFileTypes: true });
            for (const { name: folder } of folders.filter((i) => i.isDirectory())) {
                if (!fs.existsSync(path.join(tmp, folder, 'problem.json'))) continue;
                const buf = await fs.readFile(path.join(tmp, folder, 'problem.json'));
                const pdoc = JSON.parse(buf.toString());
                const content: ContentNode[] = [];
                if (pdoc.description?.value) {
                    content.push({
                        type: 'Text',
                        subType: 'html',
                        sectionTitle: this.translate('Description'),
                        text: pdoc.description.value,
                    });
                }
                if (pdoc.input_description?.value) {
                    content.push({
                        type: 'Text',
                        subType: 'html',
                        sectionTitle: this.translate('Input Format'),
                        text: pdoc.input_description.value,
                    });
                }
                if (pdoc.output_description?.value) {
                    content.push({
                        type: 'Text',
                        subType: 'html',
                        sectionTitle: this.translate('Output Format'),
                        text: pdoc.output_description.value,
                    });
                }
                if (pdoc.samples?.length) {
                    content.push(...pdoc.samples.map((sample) => ({
                        type: 'Sample',
                        sectionTitle: this.translate('Sample'),
                        payload: [sample.input, sample.output],
                    })));
                }
                if (pdoc.hint?.value) {
                    content.push({
                        type: 'Text',
                        subType: 'html',
                        sectionTitle: this.translate('Hint'),
                        text: pdoc.hint.value,
                    });
                }
                if (pdoc.source?.value) {
                    content.push({
                        type: 'Text',
                        subType: 'html',
                        sectionTitle: this.translate('Source'),
                        text: pdoc.source.value,
                    });
                }
                if (+pdoc.display_id) pdoc.display_id = `P${pdoc.display_id}`;
                const isValidPid = async (id: string) => {
                    if (!(/^[A-Za-z]+[0-9A-Za-z]*$/.test(id))) return false;
                    if (await ProblemModel.get(domainId, id)) return false;
                    return true;
                };
                if (!await isValidPid(pdoc.display_id)) pdoc.display_id = null;
                const pid = await ProblemModel.add(
                    domainId, pdoc.display_id, pdoc.title, buildContent(content, 'html'),
                    this.user._id, pdoc.tags || [],
                );
                const config: ProblemConfigFile = {
                    time: `${pdoc.time_limit}ms`,
                    memory: `${pdoc.memory_limit}m`,
                    subtasks: [],
                };
                const tasks = [];
                for (const tc of pdoc.test_case_score) {
                    tasks.push(ProblemModel.addTestdata(
                        domainId, pid, tc.input_name,
                        path.join(tmp, folder, 'testcase', tc.input_name),
                    ));
                    if (tc.output_name !== '-') {
                        tasks.push(ProblemModel.addTestdata(
                            domainId, pid, tc.output_name,
                            path.join(tmp, folder, 'testcase', tc.output_name),
                        ));
                    }
                    config.subtasks.push({
                        score: tc.score,
                        cases: [{
                            input: tc.input_name,
                            output: tc.output_name === '-' ? '/dev/null' : tc.output_name,
                        }],
                    });
                }
                if (pdoc.spj?.language === 'C++') {
                    tasks.push(ProblemModel.addTestdata(
                        domainId, pid, 'checker.cc',
                        Buffer.from(pdoc.spj.code),
                    ));
                    config.checker = 'checker.cc';
                    config.checker_type = 'qduoj';
                }
                tasks.push(
                    ProblemModel.addTestdata(domainId, pid, 'config.yaml', Buffer.from(yaml.dump(config))),
                    ProblemModel.edit(domainId, pid, { html: true }),
                );
                await Promise.all(tasks);
                cnt++;
            }
        } finally {
            await fs.remove(tmp);
        }
        if (!cnt) throw new ValidationError('zip', 'No problemset imported');
    }

    async get() {
        this.response.body = { type: 'QDUOJ' };
        this.response.template = 'problem_import.html';
    }

    async post({ domainId }) {
        if (!this.request.files.file) throw new ValidationError('file');
        const stat = await fs.stat(this.request.files.file.filepath);
        if (stat.size > 128 * 1024 * 1024) throw new ValidationError('file', 'File too large');
        await this.fromFile(domainId, this.request.files.file.filepath);
        this.response.redirect = this.url('problem_main');
    }
}

export const name = 'import-qduoj';
export async function apply(ctx: Context) {
    ctx.Route('problem_import_qduoj', '/problem/import/qduoj', ImportQduojHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.inject('ProblemAdd', 'problem_import_qduoj', { icon: 'copy', text: 'From QDUOJ Export' });
    ctx.i18n.load('zh', {
        'From QDUOJ Export': '从 QDUOJ 导入',
    });
}
