/* eslint-disable no-await-in-loop */
import superagent from 'superagent';
import { PRIV } from '../model/builtin';
import MessageModel from '../model/message';
import * as SystemModel from '../model/system';
import UserModel from '../model/user';

export const description = 'Get System Packages Latest Version From Yarn Registry';

async function getpackNetVersion(packName:string) {
    try {
        const packInfoRes = await superagent.get(`https://registry.yarnpkg.com/${(packName !== 'hydrooj') ? `@hydrooj/${packName}` : packName}`);
        return packInfoRes.body['dist-tags']['latest'];
    } catch (e) {
        return null;
    }
}

function beyondVersion(versionA:string, versionB:string) {
    const versionAarray = versionA.split('.');
    const versionBarray = versionB.split('.');
    const maxL = Math.max(versionAarray.length, versionBarray.length);
    let result = 0;
    for (let i = 0; i < maxL; i++) {
        const verAValue = versionAarray.length > i ? parseInt(versionAarray[i], 10) : 0;
        const verBValue = versionBarray.length > i ? parseInt(versionBarray[i], 10) : 0;
        if (verAValue < verBValue) {
            result = 1;
            break;
        } else if (verAValue > verBValue) {
            result = -1;
            break;
        }
    }
    return result;
}

export async function run() {
    const packNowVersion = global.Hydro.version;
    const admins = await UserModel.getMulti({ priv: { $bitsAllSet: PRIV.PRIV_VIEW_SYSTEM_NOTIFICATION } }).toArray();
    for (const name in packNowVersion) {
        if (name === 'node') continue;
        const packNewVersion = await getpackNetVersion(name);
        if (packNewVersion === null) continue;
        const packDBVersion = SystemModel.get(`checkVersion.${name}`);
        if (beyondVersion(packDBVersion, packNewVersion) === 1) {
            SystemModel.set(`checkVersion.${name}`, packNewVersion);
            if (beyondVersion(packNowVersion[name], packNewVersion) === 1) {
                await Promise.all(
                    admins.map((udoc) =>
                        MessageModel.send(1, udoc._id,
                            `Package ${name}(v${packNowVersion[name]}) has a new version ${packNewVersion}, `
                            + 'you should upgrade it for better experience.', 0)),
                );
            }
        }
    }
    return true;
}

export const validate = {};

global.Hydro.script.checkUpdate = { run, description, validate };
