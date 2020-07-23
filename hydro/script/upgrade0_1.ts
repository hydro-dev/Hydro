import * as domain from '../model/domain';

export const description = 'Upgrade database from 0 to 1';

export async function run() {
    const ddoc = await domain.get('system');
    if (!ddoc) await domain.add('system', 0, 'Hydro', 'Hydro System');
}

export const validate = {};

global.Hydro.script.setSuperadmin = { run, description, validate };
