/* eslint-disable no-await-in-loop */
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import {
    buildContent, Context, extractZip, FileTooLargeError, fs, Handler, PERM,
    ProblemConfigFile, ProblemModel, randomstring, Schema, ValidationError, yaml, Zip,
} from 'hydrooj';

const tmpdir = path.join(os.tmpdir(), 'hydro', 'import-qduoj');
fs.ensureDirSync(tmpdir);

const StringValue = Schema.object({
    format: Schema.union(['html', 'markdown']).default('html'),
    value: Schema.string(),
});
const ProblemSchema = Schema.object({
    tags: Schema.array(Schema.string()),
    title: Schema.string().required(),
    description: StringValue,
    input_description: StringValue,
    output_description: StringValue,
    samples: Schema.array(Schema.object({
        input: Schema.string(),
        output: Schema.string(),
    })),
    hint: StringValue,
    source: Schema.union([StringValue, Schema.string()]),
    display_id: Schema.transform(
        Schema.union([Schema.number(), Schema.string()]),
        (value) => (typeof value === 'number' ? `P${value.toString()}` : value),
    ),
    time_limit: Schema.union([Schema.number(), Schema.string()]).required(),
    memory_limit: Schema.union([Schema.number(), Schema.string()]).required(),
    spj: Schema.union([
        Schema.never(),
        Schema.object({
            language: Schema.string().required(),
            code: Schema.string().required(),
        }),
    ]),
    test_case_score: Schema.array(Schema.object({
        input_name: Schema.string().required(),
        output_name: Schema.string().required(),
        score: Schema.number().required(),
    })),
});

class ImportQduojHandler extends Handler {
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
                if (!fs.existsSync(path.join(tmp, folder, 'problem.json'))) continue;
                const buf = await fs.readFile(path.join(tmp, folder, 'problem.json'));
                const pdoc = ProblemSchema(JSON.parse(buf.toString()));
                const content = buildContent({
                    description: pdoc.description?.value,
                    input: pdoc.input_description?.value,
                    output: pdoc.output_description?.value,
                    samples: pdoc.samples.map((sample) => [sample.input, sample.output]),
                    hint: pdoc.hint?.value,
                    source: typeof pdoc.source === 'string' ? pdoc.source : pdoc.source?.value || '',
                }, 'html');
                if (+pdoc.display_id) pdoc.display_id = `P${pdoc.display_id}`;
                const isValidPid = async (id: string) => {
                    if (!(/^[A-Za-z][0-9A-Za-z]*$/.test(id))) return false;
                    if (await ProblemModel.get(domainId, id)) return false;
                    return true;
                };
                if (!await isValidPid(pdoc.display_id)) pdoc.display_id = null;
                const pid = await ProblemModel.add(
                    domainId, pdoc.display_id, pdoc.title, content,
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
        const file = this.request.files.file;
        if (!file) throw new ValidationError('file');
        if (file.size > 256 * 1024 * 1024) throw new FileTooLargeError('256m');
        await this.fromFile(domainId, file.filepath);
        this.response.redirect = this.url('problem_main');
    }
}

export const name = 'import-qduoj';
export async function apply(ctx: Context) {
    ctx.Route('problem_import_qduoj', '/problem/import/qduoj', ImportQduojHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.injectUI('ProblemAdd', 'problem_import_qduoj', { icon: 'copy', text: 'From QDUOJ Export' });
    ctx.i18n.load('zh', {
        'From QDUOJ Export': '从 QDUOJ 导入',
    });
}
