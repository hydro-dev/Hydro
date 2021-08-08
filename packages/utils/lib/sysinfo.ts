import systeminformation, { Systeminformation } from 'systeminformation';

const cache: any = {};

export interface StatusUpdate {
    memory: Systeminformation.MemData;
    load: Systeminformation.CurrentLoadData;
    battery: Systeminformation.BatteryData;
    CpuTemp: Systeminformation.CpuTemperatureData;
}

export interface StatusFull extends StatusUpdate {
    mid: string;
    cpu: Systeminformation.CpuData;
    osinfo: Systeminformation.OsData;
}

export async function get(): Promise<StatusFull> {
    const [uuid, cpu, memory, osinfo, load, CpuTemp, battery] = await Promise.all([
        systeminformation.uuid(),
        systeminformation.cpu(),
        systeminformation.mem(),
        systeminformation.osInfo(),
        systeminformation.currentLoad(),
        systeminformation.cpuTemperature(),
        systeminformation.battery(),
    ]);
    const mid = uuid.hardware;
    delete osinfo.fqdn;
    cache.cpu = cpu;
    cache.osinfo = osinfo;
    cache.mid = mid;
    return {
        mid, cpu, memory, osinfo, load, CpuTemp, battery,
    };
}

export async function update(): Promise<[string, StatusUpdate, StatusFull]> {
    const [memory, load, CpuTemp, battery] = await Promise.all([
        systeminformation.mem(),
        systeminformation.currentLoad(),
        systeminformation.cpuTemperature(),
        systeminformation.battery(),
    ]);
    const { mid, cpu, osinfo } = cache;
    return [
        mid,
        {
            memory, load, battery, CpuTemp,
        },
        {
            mid, cpu, memory, osinfo, load, battery, CpuTemp,
        },
    ];
}
