import child, { execSync } from 'child_process';
import dns from 'dns/promises';
import { tmpdir } from 'os';
import path from 'path';
import { CAC, cac } from 'cac';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import superagent from 'superagent';
import { formatSeconds, Logger } from '@hydrooj/utils';
import * as sysinfo from '@hydrooj/utils/lib/sysinfo';
import { getAddons } from '../options';

const logger = new Logger('diagnosis');
const argv = cac().parse();

export function register(cli: CAC) {
    let baseInfo: sysinfo.StatusFull;
    let endpoints: string[] = ['hydro.ac'];

    const padEnd = (str: string, length: number) => {
        return str.length >= length ? `${str} ` : str.toString().padEnd(length, ' ');
    };

    const collectors: Record<string, () => [any, any] | Promise<[any, any]>> = {
        OS: () => {
            const info = fs.readFileSync('/etc/os-release', 'utf-8');
            const prettyName = info.split('\n').find((i) => i.startsWith('PRETTY_NAME=')).split('=')[1].trim()
                || `${baseInfo.osinfo.distro} ${baseInfo.osinfo.release} ${baseInfo.osinfo.arch}`;
            return [`${prettyName} ${baseInfo.osinfo.kernel}`, info];
        },
        CPU: () => {
            const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf-8');
            const modelName = cpuinfo.split('\n').find((i) => i.startsWith('model name')).split(':')[1].trim();
            return [
                modelName,
                cpuinfo.split('\n'),
            ];
        },
        Memory: () => {
            const total = Math.floor(baseInfo.memory.total / 1024 / 1024);
            const used = Math.floor((baseInfo.memory.total - baseInfo.memory.available) / 1024 / 1024);
            const info = `${used}/${total}MB`;
            let dmidecode = '';
            try {
                const result = child.spawnSync('dmidecode', ['-t', 'memory']);
                dmidecode = `${result.stdout.toString()}\n${result.stderr.toString()}`.trim();
            } catch (e) {
                dmidecode = e.message;
            }
            return [info, `${fs.readFileSync('/proc/meminfo', 'utf-8')}\n${dmidecode}`.split('\n')];
        },
        NodeJS: () => {
            const info = `${process.versions.node} (${process.execPath})`;
            return [info, info];
        },
        Network: async () => {
            const ips = await dns.resolve4('hydro.ac');
            const info = [`hydro.ac: ${ips.join(', ')}`];
            try {
                const res = await superagent.get('https://hydro.ac/hydroac-client-version');
                info.push(`connect: ${res.status} ${!!res.body.version}`);
                if (res.body.endpoints?.length) endpoints = res.body.endpoints;
            } catch (e) { }
            return [info.join('\n'), info.join('\n')];
        },
        PM2: async () => {
            const result = child.spawnSync('pm2', ['jlist']);
            if (result.stderr?.toString()?.trim()) {
                return [result.stderr.toString(), result.stderr.toString()];
            }
            const json = JSON.parse(result.stdout.toString());
            const processes = json.map((i) => `PID=${padEnd(i.pid || 0, 7)}${padEnd(i.name, 8)}\
${padEnd(formatSeconds(Math.floor((Date.now() - i.pm2_env.pm_uptime) / 1000), false), 8)}\
(${i.pm2_env.pm_exec_path} ${(i.pm2_env.args || []).join(' ')})`);
            return [processes, processes];
        },
        HydroOJ: () => {
            const info = `${require('hydrooj/package.json').version}${process.env.HYDRO_PROFILE ? ` (${process.env.HYDRO_PROFILE})` : ''}`;
            const addons = getAddons();
            const addonsInfo = Object.fromEntries(addons.map((i) => {
                try {
                    const pkgJson = require(`${i}/package.json`);
                    return [i, pkgJson.version];
                } catch (e) {
                    return [i, e.message];
                }
            }));
            return [
                { Hydro: info, ...addonsInfo }, { Hydro: info, ...addonsInfo },
            ];
        },
        Logs: () => {
            const logs = execSync('pm2 logs --lines 1000 --nostream', { maxBuffer: 100 * 1024 * 1024 });
            return ['Omitted, view in detail mode', logs.toString().split('\n')];
        },
    };

    const command = async () => {
        logger.info('Collecting system info');
        const infos = {};
        const infoDetails = {};
        baseInfo = await sysinfo.get();
        await Promise.all(Object.entries(collectors).map(async ([key, value]) => {
            try {
                const [info, detail] = await value();
                infos[key] = argv.options.detail ? detail : info;
                infoDetails[key] = detail;
            } catch (e) {
                infos[key] = e.message;
                infoDetails[key] = e.message;
            }
        }));
        logger.info('System info:');
        console.log(yaml.dump(infos, { noCompatMode: true, noArrayIndent: true, lineWidth: process.stdout.columns || 80 }));
        logger.info('Uploading detail to pastebin...');
        const tmpFile = path.join(tmpdir(), 'report.yaml');
        fs.writeFileSync(tmpFile, yaml.dump(infoDetails, { noArrayIndent: true, lineWidth: 150 }));
        if (process.env.VSCODE_INJECTION) {
            try {
                child.exec(`code ${tmpFile}`);
            } catch (e) { }
            try {
                child.exec(`cursor ${tmpFile}`);
            } catch (err) { }
        }
        const res = await superagent.post(`https://${endpoints[0]}/paste?code=dm`).attach('file', tmpFile);
        const [url, , ...rest] = res.text.split('\n');
        logger.info(`Info created on ${url}`);
        logger.info('Check logs content before sharing this url.');
        console.log(rest.join('\n'));
    };

    cli.command('diag').option('-d', 'detail').action(command);
    cli.command('diagnosis').option('-d', 'detail').action(command);
}
