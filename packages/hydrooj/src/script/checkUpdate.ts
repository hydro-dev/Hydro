/* eslint-disable no-await-in-loop */
import * as SemVer from 'semver';
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
    let verInfo = '';
    for (const name in packNowVersion) {
        if (name === 'node') continue;
        const packNewVersion = await getpackNetVersion(name);
        if (!packNewVersion) continue;
        const packDBVersion = SystemModel.get(`checkVersion.${name}`);
        if (SemVer.lt(packDBVersion, packNewVersion)) {
            SystemModel.set(`checkVersion.${name}`, packNewVersion);
            if (SemVer.lt(packNowVersion[name], packNewVersion)) {
                verInfo = `Package ${name}(v${packNowVersion[name]}) has a new version ${packNewVersion}, `;
            }
        }
    }
    if (!verInfo) {
        MessageModel.sendNotification(`${verInfo}you should upgrade it for better experience.`);
    }
    return true;
}

export const validate = {};

global.Hydro.script.checkUpdate = { run, description, validate };
