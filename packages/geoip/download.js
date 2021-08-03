const { spawnSync } = require('child_process');
const os = require('os');
if (os.platform() === 'linux') {
    spawnSync('bash download.sh');
}
