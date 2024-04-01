import { FilterXSS, safeAttrValue } from 'xss';

const stack = [];
const voidTags = ['br', 'hr', 'input', 'img', 'link', 'source', 'col', 'area', 'base', 'meta', 'embed', 'param', 'track', 'wbr'];

const tagCheck = new FilterXSS({
  css: false,
  whiteList: {},
  onIgnoreTag(tag, html, options) {
    if (html.endsWith('/>') || voidTags.includes(tag)) return html;
    if (!options.isClosing) {
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

export const xss = new FilterXSS({
  whiteList: {
    a: ['target', 'href', 'title'],
    abbr: ['title'],
    address: [],
    area: ['shape', 'coords', 'href', 'alt'],
    article: [],
    aside: [],
    audio: ['autoplay', 'controls', 'loop', 'preload', 'src'],
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
    col: ['align', 'valign', 'span', 'width'],
    colgroup: ['align', 'valign', 'span', 'width'],
    dd: [],
    del: ['datetime'],
    details: ['open'],
    div: ['id', 'class'],
    dl: [],
    dt: [],
    em: [],
    font: ['color', 'size', 'face'],
    h1: ['id'],
    h2: ['id', 'class'],
    h3: ['id'],
    h4: ['id'],
    h5: ['id'],
    h6: ['id'],
    header: [],
    hr: [],
    i: [],
    img: ['src', 'alt', 'title', 'width', 'height'],
    ins: ['datetime'],
    li: [],
    mark: [],
    ol: [],
    p: ['align', 'style'],
    pre: [],
    s: [],
    section: [],
    small: [],
    span: ['class', 'style'],
    sub: [],
    summary: [],
    sup: [],
    strong: ['id'],
    table: ['width', 'border', 'align', 'valign'],
    tbody: ['align', 'valign'],
    td: ['width', 'rowspan', 'colspan', 'align', 'valign', 'bgcolor'],
    tfoot: ['align', 'valign'],
    th: ['width', 'rowspan', 'colspan', 'align', 'valign'],
    thead: ['align', 'valign'],
    tr: ['rowspan', 'align', 'valign'],
    tt: [],
    u: [],
    ul: [],
    var: [],
    video: ['autoplay', 'controls', 'loop', 'preload', 'src', 'height', 'width'],
  },
  css: {
    whiteList: {
      'font-size': true,
      'font-family': true,
      'text-align': true,
      'text-indent': true,
      'margin-left': true,
      color: true,
    },
  },
  allowCommentTag: false,
  stripIgnoreTagBody: ['script'],
  safeAttrValue(tag, name, value) {
    if (name === 'id') return `xss-id-${value}`;
    if (name === 'class') return value.replace(/badge/g, 'xss-badge');
    return safeAttrValue(tag, name, value, this.cssFilter);
  },
});

export const xssInline = new FilterXSS({
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
  css: {
    whiteList: {
      'font-size': true,
      'font-family': true,
      'text-indent': true,
      color: true,
    },
  },
  allowCommentTag: false,
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script'],
  safeAttrValue(tag, name, value) {
    if (name === 'id') return `xss-id-${value}`;
    if (name === 'class') return value.replace(/badge/g, 'xss-badge');
    return safeAttrValue(tag, name, value, this.cssFilter);
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
