import path from 'path';
import fs from 'fs-extra';
import systeminformation from 'systeminformation';
import { tmpdir } from 'os';
import { noop } from 'lodash';
import { judge } from './judge/run';
import * as tmpfs from './tmpfs';

function size(s: number, base = 1) {
    s *= base;
    const unit = 1024;
    const unitNames = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    for (const unitName of unitNames) {
        if (s < unit) return '{0} {1}'.format(Math.round(s * 10) / 10, unitName);
        s /= unit;
    }
    return '{0} {1}'.format(Math.round(s * unit), unitNames[unitNames.length - 1]);
}

const cache: any = {};

async function stackSize() {
    let output = '';
    try {
        const context: any = {
            lang: 'ccWithoutO2',
            code: `#include <iostream>
using namespace std;
int i=1;
int main(){
    char a[1048576]={'1'};
    cout<<" "<<i<<flush;
    i++;
    if (i>256) return 0;
    main();
}`,
            config: {
                time: 3000,
                memory: 256,
            },
            stat: {},
            clean: [],
            next: (data) => {
                if (data.case) output = data.case.message;
            },
            end: () => { },
        };
        context.tmpdir = path.resolve(tmpdir(), 'hydro', 'tmp', 'sysinfo');
        fs.ensureDirSync(context.tmpdir);
        tmpfs.mount(context.tmpdir, '32m');
        await judge(context).catch((e) => console.error(e));
        // eslint-disable-next-line no-await-in-loop
        for (const clean of context.clean) await clean().catch(noop);
        tmpfs.umount(context.tmpdir);
        fs.removeSync(context.tmpdir);
    } catch (e) {
        return -1;
    }
    const a = output.split(' ');
    return parseInt(a[a.length - 2], 10);
}

export async function get() {
    const [
        Cpu, Memory, OsInfo,
        CurrentLoad, CpuFlags, CpuTemp,
        Battery, stack,
    ] = await Promise.all([
        systeminformation.cpu(),
        systeminformation.mem(),
        systeminformation.osInfo(),
        systeminformation.currentLoad(),
        systeminformation.cpuFlags(),
        systeminformation.cpuTemperature(),
        systeminformation.battery(),
        stackSize(),
    ]);
    const cpu = `${Cpu.manufacturer} ${Cpu.brand}`;
    const memory = `${size(Memory.active)}/${size(Memory.total)}`;
    const osinfo = `${OsInfo.distro} ${OsInfo.release} ${OsInfo.codename} ${OsInfo.kernel} ${OsInfo.arch}`;
    const load = `${CurrentLoad.avgload}`;
    const flags = CpuFlags;
    let battery;
    if (!Battery.hasbattery) battery = 'No battery';
    else battery = `${Battery.type} ${Battery.model} ${Battery.percent}%${Battery.ischarging ? ' Charging' : ''}`;
    const mid = OsInfo.serial;
    cache.cpu = cpu;
    cache.osinfo = osinfo;
    cache.flags = flags;
    cache.mid = mid;
    cache.stack = stack;
    global.reqCount = 0;
    return {
        mid, cpu, memory, osinfo, load, flags, CpuTemp, battery, stack, reqCount: 0,
    };
}

declare global {
    namespace NodeJS {
        interface Global {
            reqCount: number,
        }
    }
}

export async function update() {
    const [Memory, CurrentLoad, CpuTemp, Battery] = await Promise.all([
        systeminformation.mem(),
        systeminformation.currentLoad(),
        systeminformation.cpuTemperature(),
        systeminformation.battery(),
    ]);
    const {
        mid, cpu, osinfo, flags, stack,
    } = cache;
    const memory = `${size(Memory.active)}/${size(Memory.total)}`;
    const load = `${CurrentLoad.avgload}`;
    let battery;
    if (!Battery.hasbattery) battery = 'No battery';
    else battery = `${Battery.type} ${Battery.model} ${Battery.percent}%${Battery.ischarging ? ' Charging' : ''}`;
    const reqCount = global.reqCount;
    global.reqCount = 0;
    return [
        mid,
        {
            memory, load, battery, CpuTemp, reqCount,
        },
        {
            mid, cpu, memory, osinfo, load, flags, battery, CpuTemp, stack, reqCount,
        },
    ];
}
