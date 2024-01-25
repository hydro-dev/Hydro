import child from 'child_process';
import fs from 'fs';
import path from 'path';
import superagent from 'superagent';

if (!process.argv[2]) throw new Error('No target specified');

// TODO support module other than packages
const target = process.argv[2].startsWith('packages/') ? process.argv[2] : `packages/${process.argv[2]}`;

const result = child.execSync(`git diff ${target}`);
const patch = result.toString().replace(new RegExp(`${target}/`, 'g'), '');
const filename = `${path.basename(target)}.patch`;
fs.writeFileSync(filename, patch);
superagent.post('https://hydro.ac/paste')
    .set('accept', 'application/json')
    .send({ body: patch, filename })
    .end((err, res) => {
        if (err) throw err;
        console.log('Paste created on ', res.text);
    });
