import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const nunjucks = require('nunjucks');
test('all arena templates compile, including jury queue and notification dialogs', () => {
    const root = new URL('./templates/', import.meta.url);
    for (const name of readdirSync(root, { recursive: true }).filter((file) => String(file).endsWith('.html'))) {
        nunjucks.compile(readFileSync(new URL(String(name).replaceAll('\\', '/'), root), 'utf8'), undefined, String(name), true);
    }
});

test('PDF statements open in another tab from both problem cards and scoreboard headings', () => {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(fileURLToPath(new URL('./templates/', import.meta.url))));
    const problems = [
        { pid: 1, label: 'A', title: 'PDF', pdf: 'statement.pdf', url: '/statement-pdf', files: [], attachments: [] },
        { pid: 2, label: 'B', title: 'Markdown', pdf: '', url: '/statement-html', files: [], attachments: [] },
    ];
    const arena = { view: 'problems', title: 'Training', links: {}, problems, rows: [] };
    for (const template of ['arena_page.html', 'arena/scoreboard-table.html']) {
        const html = env.render(template, { arena });
        assert.match(html, /href="\/statement-pdf" target="_blank" rel="noopener"/);
        assert.doesNotMatch(html, /href="\/statement-html" target="_blank"/);
    }
});

test('the Problemset heading exposes the separately selected combined PDF only when available', () => {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(fileURLToPath(new URL('./templates/', import.meta.url))));
    const arena = { view: 'problems', title: 'Training', links: {}, problems: [], statement: '/contest/arena/statement' };
    const html = env.render('arena_page.html', { arena });
    assert.match(html, /Training problems <a class="btn btn-secondary" role="button"/);
    assert.match(html, /href="\/contest\/arena\/statement" target="_blank" rel="noopener"/);
    assert.match(html, /<use href="#i-pdf"\/><\/svg> problemset<\/a>/);
    assert(!env.render('arena_page.html', { arena: { ...arena, statement: '' } }).includes('/contest/arena/statement'));
});

test('presentation management immediately shows connection details and all four startup downloads', () => {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(fileURLToPath(new URL('./templates/', import.meta.url))));
    env.addGlobal('url', (name) => `/${name}`);
    const source = readFileSync(new URL('./templates/arena_presentation.html', import.meta.url), 'utf8')
        .replace('{% extends "layout/basic.html" %}', '');
    const presentation = { enabled: true, username: 'live-test', password: 'TEST_SECRET', apiUrl: '/api', url: '/manage' };
    const html = env.renderString(source, { tdoc: { title: '现场赛' }, presentation });
    assert.match(html, /id="presentation-password"[^>]*type="password"[^>]*value="TEST_SECRET"/);
    assert.match(html, /data-copy-target="presentation-url"/);
    for (const mode of ['scoreboard', 'queue', 'clock', 'rotation']) assert(html.includes(`mode=${mode}`));
    assert(!html.includes('生成连接信息'));
    const disabled = env.renderString(source, { tdoc: { title: '现场赛' }, presentation: { ...presentation, enabled: false } });
    assert(disabled.includes('连接已停用'));
    assert(!disabled.includes('?download=1'));
});
