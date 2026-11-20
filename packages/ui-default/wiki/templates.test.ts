import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const cases = {
  'binary-search': `
    assert(first_ge({}, 3) == 0);
    assert(first_ge({1, 3, 3, 7}, 0) == 0);
    assert(first_ge({1, 3, 3, 7}, 3) == 1);
    assert(first_ge({1, 3, 3, 7}, 4) == 3);
    assert(first_ge({1, 3, 3, 7}, 8) == 4);
  `,
  dsu: `
    DSU sets(5);
    assert(sets.find(0) != sets.find(1));
    assert(sets.unite(0, 1));
    assert(sets.unite(2, 3));
    assert(sets.unite(1, 3));
    assert(!sets.unite(0, 2));
    assert(sets.find(0) == sets.find(3));
    assert(sets.find(0) != sets.find(4));
  `,
  bfs: `
    std::vector<std::vector<int>> graph{{1, 2}, {0, 3}, {3, 1}, {2, 3}, {}};
    assert((bfs(graph, 0) == std::vector<int>{0, 1, 1, 2, -1}));
    assert((bfs(graph, 4) == std::vector<int>{-1, -1, -1, -1, 0}));
  `,
  dijkstra: `
    std::vector<std::vector<Edge>> graph{
        {{1, 9}, {1, 8}, {2, 2}, {4, INF - 2}},
        {{3, 0}},
        {{1, 3}},
        {},
        {{5, 8}},
        {}
    };
    assert((dijkstra(graph, 0) == std::vector<long long>{0, 5, 2, 5, INF - 2, INF}));
  `,
};

for (const [slug, assertions] of Object.entries(cases)) {
  const source = join(__dirname, 'articles', `${slug}.md`);
  test(`${slug} article template compiles and handles edge cases`, { skip: !existsSync(source) }, () => {
    const code = readFileSync(source, 'utf8').match(/^```cpp\n([\s\S]*?)^```$/m)?.[1];
    assert.ok(code, `Missing C++ fence: ${slug}`);

    const dir = mkdtempSync(join(tmpdir(), 'hgnu-wiki-'));
    try {
      const input = join(dir, 'template.cpp');
      const binary = join(dir, 'template');
      writeFileSync(input, `${code}\n#include <cassert>\nint main() {${assertions}}\n`);
      execFileSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', input, '-o', binary]);
      execFileSync(binary, { timeout: 5000 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
