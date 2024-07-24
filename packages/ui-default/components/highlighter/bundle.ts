import { createdBundledHighlighter } from '@shikijs/core';
import { bundledThemes } from 'shiki/themes';
import getWasmInlined from 'shiki/wasm';
export * from '@shikijs/core';
export { bundledThemesInfo } from 'shiki/themes';
export { createCssVariablesTheme } from 'shiki/theme-css-variables';

const bundledLanguagesInfo = [
  {
    'id': 'c',
    'name': 'C',
    'import': () => import('shiki/langs/c.mjs'),
  },
  {
    'id': 'cpp',
    'name': 'C++',
    'aliases': [
      'c++',
    ],
    'import': () => import('shiki/langs/cpp.mjs'),
  },
  {
    'id': 'css',
    'name': 'CSS',
    'import': () => import('shiki/langs/css.mjs'),
  },
  {
    'id': 'html',
    'name': 'HTML',
    'import': () => import('shiki/langs/html.mjs'),
  },
  {
    'id': 'html-derivative',
    'name': 'HTML (Derivative)',
    'import': () => import('shiki/langs/html-derivative.mjs'),
  },
  {
    'id': 'java',
    'name': 'Java',
    'import': () => import('shiki/langs/java.mjs'),
  },
  {
    id: 'kotlin',
    name: 'Kotlin',
    import: () => import('shiki/langs/kotlin.mjs'),
    aliases: ['kt'],
  },
  {
    'id': 'javascript',
    'name': 'JavaScript',
    'aliases': [
      'js',
    ],
    'import': () => import('shiki/langs/javascript.mjs'),
  },
  {
    'id': 'jinja',
    'name': 'Jinja',
    'aliases': [
      'nunjucks',
      'njk',
    ],
    'import': () => import('shiki/langs/jinja.mjs'),
  },
  {
    'id': 'json',
    'name': 'JSON',
    'import': () => import('shiki/langs/json.mjs'),
  },
  {
    'id': 'json5',
    'name': 'JSON5',
    'import': () => import('shiki/langs/json5.mjs'),
  },
  {
    'id': 'jsonc',
    'name': 'JSON with Comments',
    'import': () => import('shiki/langs/jsonc.mjs'),
  },
  {
    'id': 'jsonl',
    'name': 'JSON Lines',
    'import': () => import('shiki/langs/jsonl.mjs'),
  },
  {
    'id': 'jsx',
    'name': 'JSX',
    'import': () => import('shiki/langs/jsx.mjs'),
  },
  {
    'id': 'julia',
    'name': 'Julia',
    'aliases': [
      'jl',
    ],
    'import': () => import('shiki/langs/julia.mjs'),
  },
  {
    'id': 'lua',
    'name': 'Lua',
    'import': () => import('shiki/langs/lua.mjs'),
  },
  {
    'id': 'markdown',
    'name': 'Markdown',
    'aliases': [
      'md',
    ],
    'import': () => import('shiki/langs/markdown.mjs'),
  },
  {
    'id': 'mdc',
    'name': 'MDC',
    'import': () => import('shiki/langs/mdc.mjs'),
  },
  {
    'id': 'mdx',
    'name': 'MDX',
    'import': () => import('shiki/langs/mdx.mjs'),
  },
  {
    'id': 'php',
    'name': 'PHP',
    'import': () => import('shiki/langs/php.mjs'),
  },
  {
    'id': 'python',
    'name': 'Python',
    'aliases': [
      'py',
    ],
    'import': () => import('shiki/langs/python.mjs'),
  },
  {
    'id': 'r',
    'name': 'R',
    'import': () => import('shiki/langs/r.mjs'),
  },
  {
    'id': 'go',
    'name': 'Go',
    import: () => import('shiki/langs/go.mjs'),
  },
  {
    id: 'rust',
    name: 'Rust',
    import: () => import('shiki/langs/rust.mjs'),
    aliases: ['rs'],
  },
  {
    id: 'pascal',
    name: 'Pascal',
    import: () => import('shiki/langs/pascal.mjs'),
    aliases: ['pas'],
  },
  {
    'id': 'regexp',
    'name': 'RegExp',
    'aliases': [
      'regex',
    ],
    'import': () => import('shiki/langs/regexp.mjs'),
  },
  {
    'id': 'ruby',
    'name': 'Ruby',
    'aliases': [
      'rb',
    ],
    'import': () => import('shiki/langs/ruby.mjs'),
  },
  {
    id: 'csharp',
    name: 'C#',
    import: () => import('shiki/langs/csharp.mjs'),
    aliases: ['cs'],
  },
  {
    'id': 'shellscript',
    'name': 'Shell',
    'aliases': [
      'bash',
      'sh',
      'shell',
      'zsh',
    ],
    'import': () => import('shiki/langs/shellscript.mjs'),
  },
  {
    'id': 'sql',
    'name': 'SQL',
    'import': () => import('shiki/langs/sql.mjs'),
  },
  {
    'id': 'toml',
    'name': 'TOML',
    'import': () => import('shiki/langs/toml.mjs'),
  },
  {
    id: 'haskell',
    name: 'Haskell',
    import: () => import('shiki/langs/haskell.mjs'),
    aliases: ['hs'],
  },
  {
    'id': 'tsx',
    'name': 'TSX',
    'import': () => import('shiki/langs/tsx.mjs'),
  },
  {
    'id': 'typescript',
    'name': 'TypeScript',
    'aliases': [
      'ts',
    ],
    'import': () => import('shiki/langs/typescript.mjs'),
  },
  {
    'id': 'wasm',
    'name': 'WebAssembly',
    'import': () => import('shiki/langs/wasm.mjs'),
  },
  {
    'id': 'xml',
    'name': 'XML',
    'import': () => import('shiki/langs/xml.mjs'),
  },
  {
    'id': 'yaml',
    'name': 'YAML',
    'aliases': [
      'yml',
    ],
    'import': () => import('shiki/langs/yaml.mjs'),
  },
];
const bundledLanguagesBase = Object.fromEntries(bundledLanguagesInfo.map((i) => [i.id, i.import]));
const bundledLanguagesAlias = Object.fromEntries(bundledLanguagesInfo.flatMap((i) => i.aliases?.map((a) => [a, i.import]) || []));
const bundledLanguages = {
  ...bundledLanguagesBase,
  ...bundledLanguagesAlias,
};

const createHighlighter = (args) => createdBundledHighlighter(
  bundledLanguages,
  bundledThemes,
  getWasmInlined,
)(args);

function addLanguage(id: string, name: string, importFunc: () => Promise<any>, aliases?: string[]) {
  bundledLanguagesInfo.push({
    id, name, import: importFunc, aliases,
  });
  bundledLanguagesBase[id] = importFunc;
  bundledLanguages[id] = importFunc;
  for (const alias of aliases || []) {
    bundledLanguagesAlias[alias] = importFunc;
    bundledLanguages[id] = importFunc;
  }
}

export {
  bundledLanguages, bundledLanguagesAlias,
  bundledLanguagesInfo, bundledThemes,
  createHighlighter, addLanguage,
};
