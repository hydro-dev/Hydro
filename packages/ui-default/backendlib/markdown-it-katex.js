// https://github.com/waylonflinn/markdown-it-katex/blob/master/index.js
const katex = require('katex');

const logger = new global.Hydro.Logger('katex');

function isValidDelim(state, pos) {
  const max = state.posMax;
  const prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
  const nextChar = pos + 1 <= max ? state.src.charCodeAt(pos + 1) : -1;
  let canOpen = true;
  let canClose = true;
  if (prevChar === 0x09
    ||/* \t */ (nextChar >= 0x30/* "0" */ && nextChar <= 0x39/* "9" */)) canClose = false;
  if (nextChar === 0x09/* \t */) canOpen = false;
  return {
    canOpen,
    canClose,
  };
}

function inline(state, silent) {
  let pos;
  if (state.src[state.pos] !== '$') return false;
  let res = isValidDelim(state, state.pos);
  if (!res.canOpen) {
    if (!silent) state.pending += '$';
    state.pos += 1;
    return true;
  }
  const start = state.pos + 1;
  let match = start;
  // eslint-disable-next-line no-cond-assign
  while ((match = state.src.indexOf('$', match)) !== -1) {
    pos = match - 1;
    while (state.src[pos] === '\\') pos -= 1;
    if ((match - pos) % 2) break;
    match += 1;
  }
  if (match === -1) {
    if (!silent) state.pending += '$';
    state.pos = start;
    return true;
  }
  if (match - start === 0) {
    if (!silent) state.pending += '$$';
    state.pos = start + 1;
    return true;
  }
  res = isValidDelim(state, match);
  if (!res.canClose) {
    if (!silent) state.pending += '$';
    state.pos = start;
    return true;
  }
  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.markup = '$';
    token.content = state.src.slice(start, match);
  }
  state.pos = match + 1;
  return true;
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function block(state, start, end, silent) {
  let lastLine;
  let lastPos;
  let found = false;
  let pos = state.bMarks[start] + state.tShift[start];
  let max = state.eMarks[start];
  if (pos + 2 > max) return false;
  if (state.src.slice(pos, pos + 2) !== '$$') return false;
  pos += 2;
  let firstLine = state.src.slice(pos, max);
  if (silent) return true;
  if (firstLine.trim().slice(-2) === '$$') {
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  }
  let next = start;
  while (!found) {
    next++;
    if (next >= end) break;
    pos = state.bMarks[next] + state.tShift[next];
    max = state.eMarks[next];
    if (pos < max && state.tShift[next] < state.blkIndent) break;
    if (state.src.slice(pos, max).trim().slice(-2) === '$$') {
      lastPos = state.src.slice(0, max).lastIndexOf('$$');
      lastLine = state.src.slice(pos, lastPos);
      found = true;
    }
  }
  state.line = next + 1;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = (firstLine && firstLine.trim() ? `${firstLine}\n` : '')
    + state.getLines(start + 1, next, state.tShift[start], true)
    + (lastLine && lastLine.trim() ? lastLine : '');
  token.map = [start, state.line];
  token.markup = '$$';
  return true;
}

module.exports = function plugin(md) {
  const options = { throwOnError: false, strict: 'ignore' };
  const katexInline = function (latex) {
    options.displayMode = false;
    try {
      latex = latex.replace(/\\def{\\([a-zA-Z0-9]+)}/g, '\\def\\$1');
      return katex.renderToString(latex, options);
    } catch (error) {
      if (options.throwOnError) logger.error(error);
      return `<p class='katex-error' title='${escapeHtml(error.toString())}'>${escapeHtml(latex)}</p>`;
    }
  };
  const inlineRenderer = function (tokens, idx) {
    return katexInline(tokens[idx].content);
  };
  const katexBlock = function (latex) {
    options.displayMode = true;
    try {
      latex = latex.replace(/\\def{\\([a-zA-Z0-9]+)}/g, '\\def\\$1');
      return `<p>${katex.renderToString(latex, options)}</p>`;
    } catch (error) {
      if (options.throwOnError) logger.error(error);
      return `<p class='katex-block katex-error' title='${escapeHtml(error.toString())}'>${escapeHtml(latex)}</p > `;
    }
  };

  const blockRenderer = function (tokens, idx) {
    return `${katexBlock(tokens[idx].content)}\n`;
  };
  md.inline.ruler.after('escape', 'math_inline', inline);
  md.block.ruler.after('blockquote', 'math_block', block, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.renderer.rules.math_inline = inlineRenderer;
  md.renderer.rules.math_block = blockRenderer;
};
