/* eslint-disable no-await-in-loop */
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import {
    buildContent, Context, extractZip, fs, Handler, PERM,
    ProblemConfigFile, ProblemModel, randomstring, ValidationError, yaml, Zip,
} from 'hydrooj';

const tmpdir = path.join(os.tmpdir(), 'hydro', 'import-hoj');
fs.ensureDirSync(tmpdir);

class ImportHojHandler extends Handler {
    async fromFile(domainId: string, zipfile: string) {
        const zip = new Zip.ZipReader(Readable.toWeb(fs.createReadStream(zipfile)));
        const tmp = path.resolve(tmpdir, randomstring(32));
        await extractZip(zip, tmp, {
            strip: true,
            parseError: (e) => new ValidationError('zip', null, e.message),
        });
        let cnt = 0;
        try {
            const folders = await fs.readdir(tmp, { withFileTypes: true });
            for (const { name: folder } of folders.filter((i) => i.isDirectory())) {
                if (!fs.existsSync(path.join(tmp, `${folder}.json`))) continue;
                const buf = await fs.readFile(path.join(tmp, `${folder}.json`));
                const doc = JSON.parse(buf.toString());
                const pdoc = doc.problem;
                const content = {
                    description: pdoc.description,
                    input: pdoc.input,
                    output: pdoc.output,
                    samples: [],
                    hint: pdoc.hint,
                    source: pdoc.source,
                };
                if (pdoc.examples) {
                    const re = /<input>([\s\S]*?)<\/input><output>([\s\S]*?)<\/output>/g;
                    const examples = pdoc.examples.match(re).map((i) => {
                        const m = i.match(/<input>([\s\S]*?)<\/input><output>([\s\S]*?)<\/output>/);
                        return { input: m[1], output: m[2] };
                    });
                    content.samples = examples.map((sample) => ([sample.input, sample.output]));
                }
                const isValidPid = async (id: string) => {
                    if (!(/^[A-Za-z][0-9A-Za-z]*$/.test(id))) return false;
                    if (await ProblemModel.get(domainId, id)) return false;
                    return true;
                };
                if (!await isValidPid(pdoc.problemId)) pdoc.display_id = null;
                const pid = await ProblemModel.add(
                    domainId, pdoc.display_id, pdoc.title, buildContent(content, 'markdown'),
                    this.user._id, doc.tags || [],
                );
                const config: ProblemConfigFile = {
                    time: `${pdoc.timeLimit}ms`,
                    memory: `${pdoc.memoryLimit}m`,
                    subtasks: [],
                };
                if (pdoc.isFileIO && pdoc.ioReadFileName && pdoc.ioWriteFileName) {
                    config.filename = pdoc.ioReadFileName.split('.')[0].trim();
                }
                const tasks = [];
                for (const tc of doc.samples) {
                    tasks.push(ProblemModel.addTestdata(
                        domainId, pid, tc.input,
                        path.join(tmp, folder, tc.input),
                    ));
                    tasks.push(ProblemModel.addTestdata(
                        domainId, pid, tc.output,
                        path.join(tmp, folder, tc.output),
                    ));
                    config.subtasks.push({
                        ...(tc.score ? { score: tc.score } : {}),
                        cases: [{
                            input: tc.input,
                            output: tc.output,
                        }],
                    });
                }
                if (pdoc.spjLanguage === 'C++') {
                    tasks.push(ProblemModel.addTestdata(
                        domainId, pid, 'checker.cc',
                        Buffer.from(pdoc.spjCode),
                    ));
                    config.checker = 'checker.cc';
                    config.checker_type = 'testlib';
                }
                if (pdoc.userExtraFile) {
                    for (const file of Object.keys(pdoc.userExtraFile)) {
                        if (file === 'testlib.h') continue;
                        tasks.push(ProblemModel.addTestdata(
                            domainId, pid, file, Buffer.from(pdoc.userExtraFile[file]),
                        ));
                        config.user_extra_files ||= [];
                        config.user_extra_files.push(file);
                    }
                }
                if (pdoc.judgeExtraFile) {
                    for (const file of Object.keys(pdoc.judgeExtraFile)) {
                        tasks.push(ProblemModel.addTestdata(
                            domainId, pid, file, Buffer.from(pdoc.judgeExtraFile[file]),
                        ));
                        config.judge_extra_files ||= [];
                        config.judge_extra_files.push(file);
                    }
                }
                tasks.push(ProblemModel.addTestdata(domainId, pid, 'config.yaml', Buffer.from(yaml.dump(config))));
                await Promise.all(tasks);
                cnt++;
            }
        } finally {
            await fs.remove(tmp);
        }
        if (!cnt) throw new ValidationError('zip', 'No problemset imported');
    }

    async get() {
        this.response.body = { type: 'HOJ' };
        this.response.template = 'problem_import.html';
    }

    async post({ domainId }) {
        const file = this.request.files.file;
        if (!file) throw new ValidationError('file');
        if (file.size > 128 * 1024 * 1024) throw new ValidationError('file', 'File too large');
        await this.fromFile(domainId, file.filepath);
        this.response.redirect = this.url('problem_main');
    }
}

export const name = 'import-hoj';
export async function apply(ctx: Context) {
    ctx.Route('problem_import_hoj', '/problem/import/hoj', ImportHojHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.injectUI('ProblemAdd', 'problem_import_hoj', { icon: 'copy', text: 'From HOJ Export' });
    ctx.i18n.load('zh', {
        'From HOJ Export': '从 HOJ 导入',
    });
}
