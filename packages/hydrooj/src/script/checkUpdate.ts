/* eslint-disable no-await-in-loop */
import * as semver from 'semver';
import superagent from 'superagent';
import MessageModel from '../model/message';
import * as system from '../model/system';

export const description = 'Daily update check';

async function getRemoteVersion(id: string) {
    try {
        const res = await superagent.get(`https://registry.yarnpkg.com/${id}`);
        return res.body['dist-tags'].latest;
    } catch (e) {
        return null;
    }
}

export async function run() {
    const current = global.Hydro.version;
    const message = [''];
    for (const name in current) {
        if (name === 'node') continue;
        const id = name === 'hydrooj' ? name : `@hydrooj/${name}`;
        const remote = await getRemoteVersion(id);
        if (!remote) continue;
        const stored = system.get(`checkVersion.${id}`);
        if (semver.lt(stored, remote)) {
            system.set(`checkVersion.${id}`, remote);
            if (semver.lt(current[name], remote)) {
                message.push(`${id}\t${current[name]} -> ${remote}`);
            }
        }
    }
    if (message.length > 1) {
        MessageModel.sendNotification('Packages have new version: {0}', message.join('\n'));
    }
    return true;
}

export const validate = {};

global.Hydro.script.checkUpdate = { run, description, validate };
