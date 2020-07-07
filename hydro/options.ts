import fs from 'fs';
import os from 'os';
import path from 'path';
import { defaults } from 'lodash';

let f = path.resolve(process.cwd(), 'config.json');
if (!fs.existsSync(f)) f = path.resolve(os.homedir(), '.config', 'hydro', 'config.json');
if (!fs.existsSync(f)) f = path.resolve('/config/config.json');
const t = JSON.parse(fs.readFileSync(f).toString());

export default defaults(t, {
    name: 'hydro',
    host: '127.0.0.1',
    port: 27017,
    username: '',
    password: '',
});
