/* eslint-disable no-await-in-loop */
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { ValidationError } from '../error';
import { PluginContext } from '../loader';
import { PERM, PRIV } from '../model/builtin';
import problem, { ProblemDoc } from '../model/problem';
import { Handler } from '../service/server';

function findOverrideContent(dir: string) {
    let files = fs.readdirSync(dir);
    if (files.includes('problem.md')) return fs.readFileSync(path.join(dir, 'problem.md'), 'utf8');
    const languages = {};
    files = files.filter((i) => /^problem_[a-zA-Z_]+\.md$/.test(i));
    if (!files.length) return null;
    for (const file of files) {
        const lang = file.slice(8, -3);
        let content: string | any[] = fs.readFileSync(path.join(dir, file), 'utf8');
        try {
            content = JSON.parse(content);
            if (!(content instanceof Array)) content = JSON.stringify(content);
        } catch (e) { }
        languages[lang] = content;
    }
    return JSON.stringify(languages);
}

class ProblemImportHydroHandler extends Handler {
    async get() {
        this.response.template = 'problem_import.html';
    }

    async post({ domainId, keepUser }) {
        if (keepUser) this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        if (!this.request.files.file) throw new ValidationError('file');
        const tmpdir = path.join(os.tmpdir(), 'hydro', `${Math.random()}.import`);
        let zip: AdmZip;
        try {
            zip = new AdmZip(this.request.files.file.filepath);
        } catch (e) {
            throw new ValidationError('zip', null, e.message);
        }
        await new Promise((resolve, reject) => {
            zip.extractAllToAsync(tmpdir, true, (err) => {
                if (err) reject(err);
                resolve(null);
            });
        });
        try {
            const problems = await fs.readdir(tmpdir);
            for (const i of problems) {
                const files = await fs.readdir(path.join(tmpdir, i));
                if (!files.includes('problem.yaml')) continue;
                const content = fs.readFileSync(path.join(tmpdir, i, 'problem.yaml'), 'utf-8');
                const pdoc: ProblemDoc = yaml.load(content) as any;
                let pid = pdoc?.pid;
                if (pid) {
                    const current = await problem.get(domainId, pid);
                    if (current) pid = undefined;
                }
                const overrideContent = findOverrideContent(path.join(tmpdir, i));
                const docId = await problem.add(
                    domainId, pid, pdoc.title, overrideContent || pdoc.content,
                    keepUser ? pdoc.owner : this.user._id, pdoc.tag, pdoc.hidden,
                );
                if (files.includes('testdata')) {
                    const datas = await fs.readdir(path.join(tmpdir, i, 'testdata'), { withFileTypes: true });
                    for (const f of datas) {
                        if (f.isDirectory()) {
                            const sub = await fs.readdir(path.join(tmpdir, i, 'testdata', f.name));
                            for (const s of sub) {
                                const stream = fs.createReadStream(path.join(tmpdir, i, 'testdata', f.name, s));
                                await problem.addTestdata(domainId, docId, `${f.name}/${s}`, stream);
                            }
                        } else if (f.isFile()) {
                            const stream = fs.createReadStream(path.join(tmpdir, i, 'testdata', f.name));
                            await problem.addTestdata(domainId, docId, f.name, stream);
                        }
                    }
                }
                if (files.includes('additional_file')) {
                    const datas = await fs.readdir(path.join(tmpdir, i, 'additional_file'), { withFileTypes: true });
                    for (const f of datas) {
                        if (f.isFile()) {
                            const stream = fs.createReadStream(path.join(tmpdir, i, 'additional_file', f.name));
                            await problem.addAdditionalFile(domainId, docId, f.name, stream);
                        }
                    }
                }
            }
        } finally {
            await fs.remove(tmpdir);
        }
        this.response.redirect = this.url('problem_main');
    }
}

export async function apply(ctx: PluginContext) {
    ctx.Route('problem_import_hydro', '/problem/import/hydro', ProblemImportHydroHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.inject('ProblemAdd', 'problem_import_hydro', { icon: 'copy', text: 'Import From Hydro' });
}
