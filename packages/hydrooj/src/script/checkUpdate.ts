/* eslint-disable no-await-in-loop */
import SuperAgent from 'superagent';
import { PRIV } from '../model/builtin';

export const description = 'Get System Packages Latest Version From Yarn Registry';

export async function run() {
    const NowVersion = global.Hydro.version;
    const Admins = global.Hydro.model.user.getMulti({ priv: { $bitsAllSet: PRIV.PRIV_VIEW_SYSTEM_NOTIFICATION } });
    for (const pack in NowVersion) {
        if (pack !== 'node') {
            const packInfoRes = await SuperAgent.get(`https://registry.yarnpkg.com/${pack !== 'hydrooj' ? `@hydrooj/${pack}` : pack}`);
            const packNewVersion = packInfoRes.body['dist-tags']['latest'];
            const dbpackVersion = global.Hydro.model.system.get(`checkVersion.${pack}`);
            if (dbpackVersion !== packNewVersion) {
                global.Hydro.model.system.set(`checkVersion.${pack}`, packNewVersion);
                if (NowVersion[pack] !== packNewVersion) {
                    Admins.forEach(async (Udoc) => {
                        await global.Hydro.model.message.send(1, Udoc._id,
                            `Package ${pack}(v${NowVersion[pack]}) has a new version ${packNewVersion}, `
                            + 'you should upgrade it for better experience.', 0);
                    });
                }
            }
        }
    }
}

export const validate = {};

global.Hydro.script.checkUpdate = { run, description, validate };
