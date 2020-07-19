import fs from 'fs';
import os from 'os';
import path from 'path';

export default function load() {
    let f = path.resolve(process.cwd(), 'config.json');
    if (!fs.existsSync(f)) f = path.resolve(__dirname, 'config.json');
    if (!fs.existsSync(f)) f = path.resolve(os.homedir(), '.config', 'hydro', 'config.json');
    if (!fs.existsSync(f)) f = path.resolve(os.homedir(), '.hydro', 'config.json');
    if (!fs.existsSync(f)) f = path.resolve('/config/config.json');
    return JSON.parse(fs.readFileSync(f).toString());
}
