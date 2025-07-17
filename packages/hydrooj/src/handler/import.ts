import { sleep } from '@hydrooj/utils';
import { Context } from '../context';
import { ValidationError } from '../error';
import { PERM, PRIV } from '../model/builtin';
import MessageModel from '../model/message';
import problem from '../model/problem';
import { Handler, param, Types } from '../service/server';

class ProblemImportHydroHandler extends Handler {
    async get() {
        this.response.template = 'problem_import.html';
    }

    @param('keepUser', Types.Boolean)
    @param('preferredPrefix', Types.String, true)
    @param('hidden', Types.Boolean)
    async post(domainId: string, keepUser: boolean, preferredPrefix?: string, hidden?: boolean) {
        if (keepUser) this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        if (!this.request.files.file) throw new ValidationError('file');
        if (preferredPrefix && !/^[a-zA-Z]+$/.test(preferredPrefix)) throw new ValidationError('preferredPrefix');
        const promise = problem.import(
            domainId, this.request.files.file.filepath,
            {
                preferredPrefix,
                progress: this.progress.bind(this),
                operator: keepUser ? null : this.user._id,
                delSource: true,
                hidden,
            },
        ).catch((e) => MessageModel.send(1, this.user._id, `Import failed: ${e.message}\n${e.stack}`));
        let resolved = false;
        await Promise.race([
            promise.then(() => { resolved = true; }),
            sleep(5000),
        ]);
        this.response.redirect = this.url('problem_main', resolved ? {} : { query: { showImport: 1 } });
    }
}

export async function apply(ctx: Context) {
    ctx.Route('problem_import_hydro', '/problem/import/hydro', ProblemImportHydroHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.injectUI('ProblemAdd', 'problem_import_hydro', { icon: 'copy', text: 'Import From Hydro' });
}
