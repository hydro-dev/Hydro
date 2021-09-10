import path from 'path';
import fs from 'fs-extra';
import { noop } from 'lodash';
import { get as _get } from '@hydrooj/utils/lib/sysinfo';
import { getConfig } from './config';
import { judge } from './judge/run';
import * as tmpfs from './tmpfs';

export { update } from '@hydrooj/utils/lib/sysinfo';

async function stackSize() {
    let output = '';
    try {
        const context: any = {
            lang: 'cc',
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
                time: '3s',
                memory: '256m',
            },
            stat: {},
            clean: [],
            next: (data) => {
                if (data.case) output = data.case.message;
            },
            end: () => { },
        };
        context.tmpdir = path.resolve(getConfig('tmp_dir'), 'sysinfo');
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
    const info = await _get();
    // @ts-ignore
    info.stack = await stackSize();
    return info;
}
