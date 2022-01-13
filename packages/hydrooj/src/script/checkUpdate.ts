/* eslint-disable no-await-in-loop */
import * as semVer from 'semver';
import superagent from 'superagent';
import MessageModel from '../model/message';
import * as SystemModel from '../model/system';

export const description = 'Get System Packages Latest Version From Yarn Registry';

async function getpackNetVersion(packName:string) {
    try {
        const packInfoRes = await superagent.get(`https://registry.yarnpkg.com/${(packName !== 'hydrooj') ? `@hydrooj/${packName}` : packName}`);
        return packInfoRes.body['dist-tags']['latest'];
    } catch (e) {
        return null;
    }
}

export async function run() {
    const packNowVersion = global.Hydro.version;
    const message = [];
    for (const name in packNowVersion) {
        if (name === 'node') continue;
        const packNewVersion = await getpackNetVersion(name);
        if (!packNewVersion) continue;
        const packDBVersion = SystemModel.get(`checkVersion.${name}`);
        if (semVer.lt(packDBVersion, packNewVersion)) {
            SystemModel.set(`checkVersion.${name}`, packNewVersion);
            if (semVer.lt(packNowVersion[name], packNewVersion)) {
                message.push(`${(name !== 'hydrooj') ? `@hydrooj/${name}` : name} v${packNowVersion[name]} -> ${packNewVersion}`);
            }
        }
    }
    if (message.length > 1) {
        MessageModel.sendNotification('Packages have new version: \n{0}', message.join('\n'));
    }
    return true;
}

export const validate = {};

global.Hydro.script.checkUpdate = { run, description, validate };
