/* eslint-disable no-await-in-loop */
import Schema from 'schemastery';
import * as semver from 'semver';
import superagent from 'superagent';
import MessageModel from '../model/message';
import system from '../model/system';

async function getRemoteVersion(id: string) {
    try {
        const res = await superagent.get(`https://registry.yarnpkg.com/${id}`);
        return res.body['dist-tags'].latest;
    } catch (e) {
        return null;
    }
}

export async function run(_: void, report: (data: any) => void) {
    const current = global.Hydro.version;
    const message = [''];
    for (const name in current) {
        if (name === 'node') continue;
        const id = name === 'hydrooj' ? name : `@hydrooj/${name}`;
        const remote = await getRemoteVersion(id);
        if (!remote) continue;
        const stored = system.get(`checkVersion.${id}`);
        if (!stored || semver.lt(stored, remote)) {
            system.set(`checkVersion.${id}`, remote);
            if (semver.lt(current[name], remote)) {
                message.push(`${id}\t${current[name]} -> ${remote}`);
            }
        }
    }
    if (message.length > 1) {
        report({ message: `Found ${message.length - 1} package${message.length > 2 ? 's have' : ' has'} new version` });
        MessageModel.sendNotification('Packages have new version: {0}', message.join('\n'));
    }
    return true;
}

export const apply = (ctx) => ctx.addScript('checkUpdate', 'Daily update check', Schema.any(), run);
