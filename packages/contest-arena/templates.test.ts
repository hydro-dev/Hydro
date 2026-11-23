import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const nunjucks = require('nunjucks');
test('all arena templates compile, including jury queue and notification dialogs', () => {
    const root = new URL('./templates/', import.meta.url);
    for (const name of readdirSync(root, { recursive: true }).filter((file) => String(file).endsWith('.html'))) {
        nunjucks.compile(readFileSync(new URL(String(name).replaceAll('\\', '/'), root), 'utf8'), undefined, String(name), true);
    }
});
