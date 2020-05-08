const os = require('os');
const child = require('child_process');

const p = child.spawn(path.resolve(os.tmpdir(), 'hydro', 'sandbox-linux', 'executorserver', ['-silent']);
if (!p.stdout) throw new Error('Cannot start executorserver');
else {
    p.stdout.on('data', (data) => {
        const s = data.toString();
        console.log(s.substr(0, s.length - 1));
    });
    p.stderr.on('data', (data) => {
        const s = data.toString();
        console.log(s.substr(0, s.length - 1));
    });
}
p.on('error', (error) => console.error(error));

async function stop() {
    p.emit('exit');
}


module.exports = { stop };
