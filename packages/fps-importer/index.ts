/* eslint-disable no-await-in-loop */
import { Readable } from 'stream';
import decodeHTML from 'decode-html';
import xml2js from 'xml2js';
import {
    _, BadRequestError, buildContent, Context, FileTooLargeError, fs, Handler, PERM, ProblemConfigFile,
    ProblemModel, ProblemType, randomstring, Schema, SolutionModel, SystemModel, ValidationError, yaml, Zip,
} from 'hydrooj';

const knownRemoteMapping = {
    bas: 'ybtbas',
};

class FpsProblemImportHandler extends Handler {
    async get() {
        this.response.template = 'problem_import_fps.html';
    }

    async run(domainId: string, result: any) {
        if (!result?.fps) throw new BadRequestError('Selected file is not a valid FPS problemset.');
        for (const p of result.fps.item) {
            const markdown = [p.description?.[0], p.input?.[0], p.output?.[0], p.hint?.[0]].some((i) => i?.includes('[md]'));
            let content = buildContent({
                description: p.description?.[0],
                input: p.input?.[0],
                output: p.output?.[0],
                samples: p.sample_input?.map((input, i) => [input, p.sample_output[i]]),
                hint: p.hint?.[0],
                source: p.source?.join(' '),
            }, 'html', (s) => this.translate(s)).replace(/<math xm<x>lns=/g, '<math xmlns=').replace(/\[\/?md\]/g, '');
            const config: ProblemConfigFile = {
                time: p.time_limit[0]._ + p.time_limit[0].$.unit,
                memory: p.memory_limit[0]._ + p.memory_limit[0].$.unit,
            };
            if (p.remote_oj?.[0]) {
                config.type = ProblemType.Remote;
                config.subType = knownRemoteMapping[p.remote_oj[0]] || p.remote_oj[0];
                config.target = p.remote_id[0];
            }
            const title = decodeHTML(p.title.join(' '));
            const tags = _.filter(p.source, (i: string) => i.trim()).flatMap((i) => i.split(' ')).filter((i) => i);
            const pid = await ProblemModel.add(domainId, null, title, content, this.user._id, tags);
            const tasks: Promise<any>[] = [ProblemModel.addTestdata(domainId, pid, 'config.yaml', Buffer.from(yaml.dump(config)))];
            if (!markdown) tasks.push(ProblemModel.edit(domainId, pid, { html: true }));
            const addTestdata = (node: any, index: string, ext: string) => {
                if (!node || !['object', 'string'].includes(typeof node)) return; // Ignore file not exist
                const id = node.$?.name || `${index}`;
                // `filename` attribute introduced by winterant/OnlineJudge
                // PLEASE, respect the spec
                const filename = node.$?.filename || `${id}.${ext}`;
                const c = node._ || (typeof node === 'string' ? node : '');
                tasks.push(ProblemModel.addTestdata(domainId, pid, filename, Buffer.from(c)));
            };
            if (p.test_output) {
                for (let i = 0; i < p.test_input.length; i++) {
                    addTestdata(p.test_input[i], `${i + 1}`, 'in');
                    addTestdata(p.test_output[i], `${i + 1}`, 'out');
                }
            } else if (p.test_input) {
                // Some version of hustoj exports only test_input section
                for (let i = 0; i < p.test_input.length / 2; i++) {
                    addTestdata(p.test_input[2 * i], `${i + 1}`, 'in');
                    addTestdata(p.test_input[2 * i + 1], `${i + 1}`, 'out');
                }
            }
            if (p.img?.length) {
                for (const img of p.img) {
                    const filename = randomstring(8) + img.src[0].split('/').pop().split('.').pop();
                    tasks.push(ProblemModel.addAdditionalFile(domainId, pid, filename, Buffer.from(img.base64[0], 'base64')));
                    content = content.replace(img.src[0], `file://${filename}`);
                }
                await ProblemModel.edit(domainId, pid, { content });
            }
            await Promise.all(tasks);
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
        const file = this.request.files.file;
        if (!file) throw new ValidationError('file');
        const tasks = [];
        try {
            if (file.size > SystemModel.get('import-fps.limit')) throw new FileTooLargeError();
            const content = await fs.readFile(file.filepath, 'utf-8');
            const result = await xml2js.parseStringPromise(content);
            tasks.push(result);
        } catch (e) {
            if (e instanceof FileTooLargeError) throw e;
            console.log(e);
            const zip = new Zip.ZipReader(Readable.toWeb(fs.createReadStream(file.filepath)));
            let entries: Zip.Entry[];
            try {
                entries = await zip.getEntries();
            } catch (err) {
                throw new ValidationError('zip', null, err.message);
            }
            for (const entry of entries) {
                try {
                    if (entry.uncompressedSize > SystemModel.get('import-fps.limit')) throw new FileTooLargeError();
                    const content = entry.getData(new Zip.TextWriter());
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

export const Config = Schema.object({
    limit: Schema.number().role('limit').default(64 * 1024 * 1024).min(1).description('Maximum file size for FPS problemset import'),
}).description('FPS Importer');

export async function apply(ctx: Context) {
    ctx.Route('problem_import_fps', '/problem/import/fps', FpsProblemImportHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.injectUI('ProblemAdd', 'problem_import_fps', { icon: 'copy', text: 'From FPS File' });
    ctx.i18n.load('zh', {
        'From FPS File': '从 FPS 文件导入',
        'problem.import.fps.hint1': '我们推荐的最大导入大小为 64MiB，若文件超出此大小，强烈建议您在本机使用 EasyFPSViewer 等工具将其拆分或是移除测试数据后单独上传。',
        'problem.import.fps.hint2': '由于 xml 格式无法随机读写，解析需要消耗大量内存，在内存过小的机器上导入大型题目包很可能导致崩溃或死机。',
        'problem.import.fps.hint3': '若您确有需要，此限制可在系统设置中更改。我们建议您使用 Hydro 自带的 zip 格式存储或是交换题目。',
    });
    ctx.i18n.load('en', {
        'From FPS File': 'Import from FPS File',
        'problem.import.fps.hint1': 'We recommend that the maximum import size is 64MiB. If the file exceeds this size, \
we strongly recommend that you use tools such as EasyFPSViewer to split it or remove the testdata and upload it separately on your local machine.',
        'problem.import.fps.hint2': 'Since the xml format cannot be read randomly, parsing requires a large amount of memory. \
Importing a large problem set on a machine with insufficient memory may cause a crash or freeze.',
        'problem.import.fps.hint3': 'If you really need it, this limit can be changed in the system settings. \
We strongly recommend that you use the zip format to store or exchange problemsets.',
    });
}
