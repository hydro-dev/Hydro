import { execSync } from 'child_process';
import fs from 'fs';
import { Context, Schema, UserModel } from 'hydrooj';
import { startPerformanceTest } from './performance-test';

export async function apply(ctx: Context) {
    // Auto authorize user 2 as super admin
    ctx.on('handler/after/UserRegisterWithCode#post', async (that) => {
        if (that.session.uid === 2) await UserModel.setSuperAdmin(2);
    });
    ctx.addScript('performance-test', 'test', Schema.object({ enable5: Schema.boolean().default(false) }), startPerformanceTest);
    const installerFileExists = fs.existsSync('/etc/HYDRO_INSTALLER');
    if (!installerFileExists) return;
    const content = fs.readFileSync('/etc/HYDRO_INSTALLER', 'utf-8');
    const val: Record<string, string> = {};
    for (const line of content.split('\n')) {
        const [key, value] = line.split('=').map((i) => i?.trim());
        if (key && value) val[key] = value;
    }
    if (val.layout === '1') {
        execSync('nix-env -iA nixpkgs.gawk');
        execSync('pm2 restart hydro-sandbox');
        fs.writeFileSync('/etc/HYDRO_INSTALLER', content.replace('layout=1', 'layout=2'));
    }
}
