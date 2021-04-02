const acorn = require('acorn');
const stage3 = require('acorn-stage3');
const walk = require('acorn-walk');
const astring = require('astring');
const path = require('path');
const fsp = require('fs').promises;

const dirWatchers = {};

const parser = acorn.Parser.extend(stage3);
async function requireContext(filePath) {
  const source = await fsp.readFile(filePath, 'utf8');
  if (!/\brequire\s*\.\s*context\s*\(/.test(source)) {
    delete dirWatchers[filePath];
    return null;
  }
  const ast = parser.parse(source,
    { sourceType: 'module', ecmaVersion: 'latest', locations: true });
  const base = path.dirname(path.resolve(filePath));
  const nodes = [];
  walk.simple(ast, {
    CallExpression(node) {
      const { callee } = node;
      const args = node.arguments;
      if (callee.type !== 'MemberExpression') return;
      if (callee.object.name !== 'require') return;
      if (callee.property.name !== 'context') return;
      if (args.length === 0) return;
      if (!args.every((arg) => arg.type === 'Literal')) return;
      if (args.length > 2 && !args[2].regex) return;
      nodes.push(node);
    },
  });
  if (nodes.length === 0) {
    delete dirWatchers[filePath];
    return null;
  }
  const imports = [];
  const dirs = [];
  await Promise.all(nodes.map(async (node) => {
    const args = node.arguments;
    const directory = path.resolve(base, args[0].value);
    const recurse = args[1] && args[1].value;
    const regExp = args[2] && new RegExp(args[2].regex.pattern, args[2].regex.flags);
    dirs.push(directory);
    async function getFiles(dir, recurse, pattern) {
      try {
        const dirents = await fsp.readdir(dir, { withFileTypes: true });
        const files = await Promise.all(dirents.map((dirent) => {
          const res = path.resolve(dir, dirent.name);
          if (dirent.isDirectory()) {
            return (recurse !== false) && getFiles(res);
          }
          return (!pattern || pattern.test(res)) ? res : null;
        }));
        return Array.prototype.concat(...files);
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
    }
    const files = (await getFiles(directory, recurse, regExp))
      .filter((file) => file).map((file) => {
        file = path.relative(base, file);
        if (!file.startsWith('/') && !file.startsWith('.')) file = `./${file}`;
        return file;
      });
    const modules = files.map((file) => Math.random().toString(36).slice(2).replace(/\d/g, '') + file.split('/').pop().split('.')[0]
      .replace(/^\w/, (c) => c.toUpperCase())
      .replace(/[-_]\w/g, (c) => c[1].toUpperCase()).replace(/\W/g, '$'));
    files.forEach((file, i) => {
      imports.push({
        type: 'ImportDeclaration',
        specifiers: [
          {
            type: 'ImportDefaultSpecifier',
            local: { type: 'Identifier', name: modules[i] },
          },
        ],
        source: { type: 'Literal', value: file, raw: JSON.stringify(file) },
      });
    });
    const keys = files.map((file) => `./${path.relative(directory, path.resolve(base, file))}`);
    const contextKeys = {
      type: 'ArrayExpression',
      elements: keys.map((file) => (
        { type: 'Literal', value: file, raw: JSON.stringify(file) }
      )),
    };
    const contextMap = {
      type: 'ObjectExpression',
      properties: keys.map((key, i) => ({
        type: 'Property',
        method: false,
        shorthand: false,
        computed: false,
        key: { type: 'Literal', value: key, raw: JSON.stringify(key) },
        value: {
          type: 'ObjectExpression',
          properties: [{
            type: 'Property',
            method: false,
            shorthand: false,
            computed: false,
            key: { type: 'Identifier', name: 'default' },
            value: { type: 'Identifier', name: modules[i] },
            kind: 'init',
          }],
        },
        kind: 'init',
      })),
    };
    const contextFn = {
      type: 'VariableDeclaration',
      declarations: [
        {
          type: 'VariableDeclarator',
          id: { type: 'Identifier', name: 'context' },
          init: {
            type: 'ArrowFunctionExpression',
            id: null,
            expression: true,
            generator: false,
            async: false,
            params: [{ type: 'Identifier', name: 'id' }],
            body: {
              type: 'MemberExpression',
              object: contextMap,
              property: { type: 'Identifier', name: 'id' },
              computed: true,
              optional: false,
            },
          },
        },
      ],
      kind: 'let',
    };
    const keyFn = {
      type: 'ExpressionStatement',
      expression: {
        type: 'AssignmentExpression',
        operator: '=',
        left: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'context' },
          property: { type: 'Identifier', name: 'keys' },
          computed: false,
          optional: false,
        },
        right: {
          type: 'ArrowFunctionExpression',
          id: null,
          expression: true,
          generator: false,
          async: false,
          params: [],
          body: contextKeys,
        },
      },
    };
    const contextExpr = {
      type: 'CallExpression',
      callee: {
        type: 'ArrowFunctionExpression',
        id: null,
        expression: false,
        generator: false,
        async: false,
        params: [],
        body: {
          type: 'BlockStatement',
          body: [
            contextFn,
            keyFn,
            {
              type: 'ReturnStatement',
              argument: {
                type: 'Identifier',
                name: 'context',
              },
            },
          ],
        },
      },
      arguments: [],
      optional: false,
    };
    delete node.callee;
    delete node.arguments;
    delete node.optional;
    Object.assign(node, contextExpr);
  }));
  ast.body.unshift(...imports);
  dirWatchers[filePath] = dirs;
  return astring.generate(ast);
}

module.exports = function (snowpackConfig, pluginOptions) {
  return {
    name: 'require-context-plugin',
    resolve: {
      input: Array.from(pluginOptions.input || ['.js']),
      output: ['.js'],
    },
    onChange({ filePath }) {
      for (const [source, dirs] of Object.entries(dirWatchers)) {
        if (dirs.some((dir) => filePath.startsWith(dir))) {
          this.markChanged(source);
        }
      }
    },
    load({ filePath }) {
      return requireContext(filePath);
    },
  };
};
