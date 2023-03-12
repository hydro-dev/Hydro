import { Context } from '../context';
import { ValidationError } from '../error';
import { PERM, PRIV } from '../model/builtin';
import problem from '../model/problem';
import { Handler } from '../service/server';

class ProblemImportHydroHandler extends Handler {
    async get() {
        this.response.template = 'problem_import.html';
    }

    async post({ domainId, keepUser }) {
        if (keepUser) this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        if (!this.request.files.file) throw new ValidationError('file');
        await problem.import(domainId, this.request.files.file.filepath, keepUser ? null : this.user._id);
        this.response.redirect = this.url('problem_main');
    }
}

export async function apply(ctx: Context) {
    ctx.Route('problem_import_hydro', '/problem/import/hydro', ProblemImportHydroHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.inject('ProblemAdd', 'problem_import_hydro', { icon: 'copy', text: 'Import From Hydro' });
}
