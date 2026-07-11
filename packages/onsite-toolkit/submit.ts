import {
    ContestModel, Context, DomainModel, fs, nanoid, ProblemDoc, ProblemModel,
    RecordModel, SettingModel, StorageModel, SystemModel,
} from 'hydrooj';
import { ContestDetailBaseHandler } from 'hydrooj/src/handler/contest';

class AutoSubmitHandler extends ContestDetailBaseHandler {
    pdoc: ProblemDoc;

    async submit({ domainId, dryrun }: { domainId: string, dryrun: boolean }) {
        if (!this.tdoc || !ContestModel.isOngoing(this.tdoc, this.tsdoc)) return { error: 'Contest not live' };
        if (!this.tdoc.allowPrint) return { error: 'Not a on-site contest' };
        const file = this.request.files?.file;
        if (!file) return { error: 'No file uploaded' };
        const filename = file.originalFilename.split('/').pop();
        if (!/^[A-Z]\./i.test(filename.toUpperCase())) return { error: 'Unsupported file name' };
        const pids = this.tdoc.pids;
        const pidIndex = filename.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
        if (pidIndex < 0 || pidIndex >= pids.length) return { error: 'Unsupported file name' };
        const pid = pids[pidIndex];
        this.pdoc = await ProblemModel.get(domainId, pid);

        const ext = filename.split('.').pop();
        let lang = ext.toLowerCase();

        const config = this.pdoc.config;
        const lengthLimit = SystemModel.get('limit.codelength') || 128 * 1024;
        if (typeof config === 'string' || config === null) return { error: 'system error' };
        const sizeLimit = config.type === 'submit_answer' ? 128 * 1024 * 1024 : lengthLimit;
        if (file.size > sizeLimit) return { error: 'File too large' };

        if (['submit_answer', 'objective'].includes(config.type)) {
            lang = '_';
        } else if ((config.langs && !config.langs.includes(lang)) || !SettingModel.langs[lang] || SettingModel.langs[lang].disabled) {
            return { error: 'Unsupported language' };
        }
        const shouldReadFile = () => {
            if (config.type === 'objective') return true;
            if (lang === '_') return false;
            return file.size < lengthLimit && !file.filepath.endsWith('.zip') && !SettingModel.langs[lang].isBinary;
        };
        let code = '';
        const files: Record<string, string> = {};
        if (shouldReadFile()) code = await fs.readFile(file.filepath, 'utf-8');
        else {
            const id = nanoid();
            await StorageModel.put(`submission/${this.user._id}/${id}`, file.filepath, this.user._id);
            files.code = `${this.user._id}/${id}#${file.originalFilename}`;
        }

        if (!code) return { error: 'Cannot submit empty code' };

        if (dryrun) {
            return {
                info: `Info
        
Contest ${this.tdoc.title}
Problem ${this.pdoc.title}
User ${this.user.uname}
School ${this.user.school}
Language ${SettingModel.langs[lang].display} (${lang})
`,
            };
        }

        await this.limitRate('add_record', 60, SystemModel.get('limit.submission_user'), '{{user}}');
        await this.limitRate('add_record', 60, SystemModel.get('limit.submission'));

        const rid = await RecordModel.add(
            domainId, this.pdoc.docId, this.user._id, lang, code, true,
            { contest: this.tdoc.docId, files, type: 'judge', notify: true },
        );
        await Promise.all([
            ProblemModel.inc(domainId, this.pdoc.docId, 'nSubmit', 1),
            DomainModel.incUserInDomain(domainId, this.user._id, 'nSubmit'),
            ContestModel.updateStatus(domainId, this.tdoc.docId, this.user._id, rid, this.pdoc.docId),
        ]);
        return { rid };
    }

    async post({ domainId, dryrun }) {
        try {
            this.response.body = await this.submit({ domainId, dryrun });
        } catch (e) {
            this.response.body = { error: e.message };
        }
    }
}

export function apply(ctx: Context) {
    ctx.Route('contest_autosubmit', '/contest/:tid/autosubmit', AutoSubmitHandler);
}
