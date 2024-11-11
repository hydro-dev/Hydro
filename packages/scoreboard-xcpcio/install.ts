import fs from 'fs';
import path from 'path';

const dist = path.join(path.dirname(require.resolve('@xcpcio/board-app/package.json')), 'dist');
const target = path.join(__dirname, 'public');
if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true });
}
fs.mkdirSync(target, { recursive: true });
fs.cpSync(path.join(dist, 'assets'), path.join(target, 'assets'), { recursive: true });
fs.cpSync(path.join(dist, 'index.html'), path.join(target, 'assets/board.html'));
console.log('Copied board app to', target);
