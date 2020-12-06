import { apply as ApplyProblemHandler } from './handlers/problem';

export async function apply() {
    await ApplyProblemHandler();
}

global.Hydro.handler.syzojApi = apply;
