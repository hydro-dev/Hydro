import { FilterCSS } from 'cssfilter';
import { escapeAttrValue, FilterXSS, safeAttrValue } from 'xss';

const stack = [];
const voidTags = ['br', 'hr', 'input', 'img', 'link', 'source', 'col', 'area', 'base', 'meta', 'embed', 'param', 'track', 'wbr'];
const depedentTags = {
  li: ['ul', 'ol'],
  tr: ['table'],
  td: ['tr'],
  th: ['tr'],
  thead: ['table'],
  tbody: ['table'],
  tfoot: ['table'],
  colgroup: ['table'],
  col: ['colgroup'],
  caption: ['table'],
  option: ['select'],
  optgroup: ['select'],
  dt: ['dl'],
  dd: ['dl'],
};
const whitelistClasses = ['row', 'columns', 'typo', 'note', 'warn'].concat(Array.from({ length: 12 }).fill(0).map((_, i) => `medium-${i + 1}`));

const tagCheck = new FilterXSS({
  css: false,
  whiteList: {},
  onIgnoreTag(tag, html, options) {
    if (html.endsWith('/>') || voidTags.includes(tag)) return html;
    if (!options.isClosing) {
      if (depedentTags[tag] && !stack.find((i) => depedentTags[tag].includes(i))) {
        return html.replace(/</g, '&lt;').replace(/>/g, '&gt;'); // 标签不可出现在该位置
      }
      stack.push(tag);
      return html;
    }
    if (stack.length === 0) {
      return html.replace(/</g, '&lt;').replace(/>/g, '&gt;'); // 没有标签可供闭合
    }
    if (stack[stack.length - 1] === tag) {
      stack.pop(); // 正常关闭
      return html;
    }
    if (stack.length - 2 >= 0 && stack[stack.length - 2] === tag) {
      // 可能丢失了一个结束标签
      html = `</${stack[stack.length - 1]}>${html}`;
      stack.pop();
      stack.pop();
      return html;
    }
    return html.replace(/</g, '&lt;').replace(/>/g, '&gt;'); // 可能多出了一个结束标签
  },
  onIgnoreTagAttr(tag, name, value) {
    return value;
  },
});

const cssFilterOptions = {
  whiteList: {
    'font-size': true,
    'font-family': true,
    'text-align': true,
    'text-indent': true,
    'margin-left': true,
    position: /relative/,
    padding: true,
    height: true,
    width: true,
    color: true,
  },
};

const CssFilter = new FilterCSS(cssFilterOptions);

const commonRules = {
  whiteList: {
    a: ['target', 'href', 'title'],
    abbr: ['title'],
    address: [],
    aside: [],
    b: [],
    bdi: ['dir'],
    bdo: ['dir'],
    big: [],
    blockquote: ['cite', 'class'],
    br: [],
    caption: [],
    center: [],
    cite: [],
    code: ['class'],
    del: ['datetime'],
    div: ['id', 'class'],
    dl: [],
    em: [],
    font: ['color', 'size', 'face'],
    header: [],
    i: [],
    ins: ['datetime'],
    mark: [],
    ol: [],
    p: ['align', 'style'],
    pre: [],
    s: [],
    small: [],
    span: ['class', 'style'],
    sub: [],
    sup: [],
    strong: ['id'],
    tt: [],
    u: [],
    var: [],
  },
  css: false,
  allowCommentTag: false,
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'semantics'],
};

export const xss = new FilterXSS({
  ...commonRules,
  whiteList: {
    ...commonRules.whiteList,
    area: ['shape', 'coords', 'href', 'alt'],
    article: [],
    audio: ['controls', 'loop', 'preload', 'src'],
    col: ['align', 'valign', 'span', 'width'],
    colgroup: ['align', 'valign', 'span', 'width'],
    dd: [],
    details: ['open'],
    dt: [],
    h1: ['id'],
    h2: ['id', 'class'],
    h3: ['id'],
    h4: ['id'],
    h5: ['id'],
    h6: ['id'],
    hr: [],
    img: ['src', 'alt', 'title', 'width', 'height'],
    li: [],
    section: [],
    summary: [],
    table: ['width', 'border', 'align', 'valign'],
    tbody: ['align', 'valign'],
    td: ['width', 'rowspan', 'colspan', 'align', 'valign', 'bgcolor'],
    tfoot: ['align', 'valign'],
    th: ['width', 'rowspan', 'colspan', 'align', 'valign'],
    thead: ['align', 'valign'],
    tr: ['rowspan', 'align', 'valign'],
    ul: [],
    video: ['controls', 'loop', 'preload', 'src', 'height', 'width'],
  },
  css: cssFilterOptions,
  safeAttrValue(tag, name, value) {
    if (name === 'id') return escapeAttrValue(`xss-id-${value}`);
    if (name === 'class') return value.split(' ').filter((i) => whitelistClasses.includes(i) || i.startsWith('language-')).join(' ');
    return safeAttrValue(tag, name, value, CssFilter);
  },
});

const inlineCssFilter = new FilterCSS({
  whiteList: {
    color: true,
  },
});

export const xssInline = new FilterXSS({
  ...commonRules,
  safeAttrValue(tag, name, value) {
    if (name === 'id') return escapeAttrValue(`xss-id-${value}`);
    if (name === 'class') return value.split(' ').filter((i) => whitelistClasses.includes(i)).join(' ');
    return safeAttrValue(tag, name, value, inlineCssFilter);
  },
});

export function ensureTag(html: string) {
  stack.length = 0;
  const res = tagCheck.process(html);
  return res + stack.map((i) => `</${i}>`).join('');
}

export function xssProtector(md) {
  function protector(state) {
    const processor = state.inlineMode ? xssInline : xss;
    for (let i = 0; i < state.tokens.length; i++) {
      const cur = state.tokens[i];
      if (cur.type === 'html_block') {
        cur.content = processor.process(cur.content);
      }
      if (cur.type === 'inline') {
        const inlineTokens = cur.children;
        for (let ii = 0; ii < inlineTokens.length; ii++) {
          if (inlineTokens[ii].type === 'html_inline') {
            inlineTokens[ii].content = processor.process(inlineTokens[ii].content);
          }
        }
      }
    }
  }

  md.core.ruler.after('linkify', 'xss', protector);
}
