/* eslint-disable max-len */
/* eslint-disable prefer-destructuring */

import { randomUUID } from 'crypto';
import MarkdownIt from 'markdown-it';

const allowFullScreen = ' webkitallowfullscreen mozallowfullscreen allowfullscreen';

const ytRegex = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
function youtubeParser(url: string) {
  const match = url.match(ytRegex);
  return match && match[7].length === 11 ? match[7] : url;
}
const vimeoRegex = /https?:\/\/(?:www\.|player\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/([^/]*)\/videos\/|album\/(\d+)\/video\/|)(\d+)(?:$|\/|\?)/;
function vimeoParser(url: string) {
  const match = url.match(vimeoRegex);
  return match && typeof match[3] === 'string' ? match[3] : url;
}
const vineRegex = /^http(?:s?):\/\/(?:www\.)?vine\.co\/v\/([a-zA-Z0-9]{1,13}).*/;
function vineParser(url: string) {
  const match = url.match(vineRegex);
  return match && match[1].length === 11 ? match[1] : url;
}
const preziRegex = /^https:\/\/prezi.com\/(.[^/]+)/;
function preziParser(url: string) {
  const match = url.match(preziRegex);
  return match ? match[1] : url;
}
// TODO: Write regex for staging and local servers.
const mfrRegex = /^http(?:s?):\/\/(?:www\.)?mfr\.osf\.io\/render\?url=http(?:s?):\/\/osf\.io\/([a-zA-Z0-9]{1,5})\/\?action=download/;
function mfrParser(url: string) {
  const match = url.match(mfrRegex);
  return match ? match[1] : url;
}
const EMBED_REGEX = /@\[([a-zA-Z].+?)]\((.*?)[)]/im;
function extractVideoParameters(url: string) {
  const parameterMap = new Map();
  const params = url.replace(/&amp;/gi, '&').split(/[#?&]/);
  if (params.length > 1) {
    for (let i = 1; i < params.length; i += 1) {
      const keyValue = params[i].split('=');
      if (keyValue.length > 1) parameterMap.set(keyValue[0], keyValue[1]);
    }
  }
  return parameterMap;
}
function resourceUrl(service: string, src: string, url: string, options) {
  if (service === 'youtube') {
    const parameters = extractVideoParameters(url);
    if (options.youtube.parameters) {
      Object.keys(options.youtube.parameters).forEach((key) => {
        parameters.set(key, options.youtube.parameters[key]);
      });
    }
    const timeParameter = parameters.get('t');
    if (timeParameter !== undefined) {
      let startTime = 0;
      const timeParts = timeParameter.match(/[0-9]+/g);
      let j = 0;
      while (timeParts.length > 0) {
        startTime += Number(timeParts.pop()) * (60 ** j);
        j += 1;
      }
      parameters.set('start', startTime);
      parameters.delete('t');
    }
    parameters.delete('v');
    parameters.delete('feature');
    parameters.delete('origin');
    const parameterArray = Array.from(parameters, (p) => p.join('='));
    const parameterPos = src.indexOf('?');
    let finalUrl = 'https://www.youtube';
    if (options.youtube.nocookie || url.indexOf('youtube-nocookie.com') > -1) finalUrl += '-nocookie';
    finalUrl += `.com/embed/${parameterPos > -1 ? src.substr(0, parameterPos) : src}`;
    if (parameterArray.length > 0) finalUrl += `?${parameterArray.join('&')}`;
    return finalUrl;
  }
  if (service === 'vimeo') return `https://player.vimeo.com/video/${src}`;
  if (service === 'vine') return `https://vine.co/v/${src}/embed/${options.vine.embed}`;
  if (service === 'prezi') {
    return `https://prezi.com/embed/${src}/?bgcolor=ffffff&amp;lock_to_path=0&amp;autoplay=0&amp;autohide_ctrls=0&amp;`
      + 'landing_data=bHVZZmNaNDBIWnNjdEVENDRhZDFNZGNIUE43MHdLNWpsdFJLb2ZHanI5N1lQVHkxSHFxazZ0UUNCRHloSXZROHh3PT0&amp;'
      + 'landing_sign=1kD6c0N6aYpMUS0wxnQjxzSqZlEB8qNFdxtdjYhwSuI';
  }
  if (service === 'osf') return `https://mfr.osf.io/render?url=https://osf.io/${src}/?action=download`;
  return src;
}

// eslint-disable-next-line import/prefer-default-export
export function Media(md: MarkdownIt) {
  const options = {
    url: resourceUrl,
    video: resourceUrl,
    youtube: { width: 640, height: 390, nocookie: false },
    vimeo: { width: 500, height: 281 },
    vine: { width: 600, height: 600, embed: 'simple' },
    prezi: { width: 550, height: 400 },
    osf: { width: '100%', height: '100%' },
    pdf: resourceUrl,
  };
  md.renderer.rules.video = function tokenizeReturn(tokens, idx) {
    let src = md.utils.escapeHtml(tokens[idx].attrGet('src'));
    const service = md.utils.escapeHtml(tokens[idx].attrGet('service')).toLowerCase();
    const checkUrl = /http(?:s?):\/\/(?:www\.)?[a-zA-Z0-9-:.]{1,}\/render(?:\/)?[a-zA-Z0-9.&;?=:%]{1,}url=http(?:s?):\/\/[a-zA-Z0-9 -:.]{1,}\/[a-zA-Z0-9]{1,5}\/\?[a-zA-Z0-9.=:%]{1,}/;
    let num;
    if (service === 'osf' && src) {
      num = Math.random() * 0x10000;
      if (src.match(checkUrl)) {
        return `<div id="${num}" class="mfr mfr-file"></div><script>`
          + `$(document).ready(function () {new mfr.Render("${num}", "${src}");`
          + '    }); </script>';
      }
      return `<div id="${num}" class="mfr mfr-file"></div><script>`
        + `$(document).ready(function () {new mfr.Render("${num}", "https://mfr.osf.io/`
        + `render?url=https://osf.io/${src}/?action=download%26mode=render");`
        + '    }); </script>';
    }
    if (service === 'bilibili') {
      if (src.startsWith('http')) src = src.split('/').pop();
      if (src.toLowerCase().startsWith('av')) src = src.toLowerCase().split('av')[1];
      src = src.split('?')[0];
      return `\
        <iframe src="//player.bilibili.com/player.html?${src.startsWith('BV') ? 'bvid' : 'aid'}=${src}"
          scrolling="no" border="0" frameborder="no" framespacing="0" width="100%" style="min-height:500px" ${allowFullScreen}></iframe>
      `;
    }
    if (service === 'msoffice') {
      return `\
        <iframe src="https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(src)}"
        scrolling="no" border="0" frameborder="no" framespacing="0" width="100%" style="min-height:500px" ${allowFullScreen}></iframe>
      `;
    }
    if (service === 'pdf') {
      if (src.startsWith('file://')) src += src.includes('?') ? '&noDisposition=1' : '?noDisposition=1';
      return `\
        <iframe src=${src} width="100%" height="700px">
        </iframe>`;
    }
    if (['url', 'video'].includes(service)) {
      return `\
        <video width="100%" controls>
          <source src="${src}" type="${src.endsWith('ogg') ? 'video/ogg' : 'video/mp4'}">
          Your browser doesn't support video tag.
        </video>`;
    }
    if (options[service]?.width) {
      return `<div class="embed-responsive embed-responsive-16by9">
      <iframe class="embed-responsive-item ${service}-player" type="text/html" width="${options[service].width || 640}"\
        height="${options[service].height || 390}"\
        src="${options.url(service, src, tokens[idx].attrGet('url'), options)}"
        frameborder="0"${allowFullScreen}></iframe></div>`;
    }
    return `<div data-${service}>${md.utils.escapeHtml(src)}</div>`;
  };
  md.inline.ruler.before('emphasis', 'video', (state, silent) => {
    const theState = state;
    const oldPos = state.pos;
    if (state.src.charCodeAt(oldPos) !== 0x40
      ||/* @ */ state.src.charCodeAt(oldPos + 1) !== 0x5B/* [ */) {
      return false;
    }
    const match = EMBED_REGEX.exec(state.src.slice(state.pos, state.src.length));
    if (!match || match.length < 3) return false;
    let [, service, src] = match;
    service = service.toLowerCase();
    if (service === 'youtube') src = youtubeParser(src);
    else if (service === 'vimeo') src = vimeoParser(src);
    else if (service === 'vine') src = vineParser(src);
    else if (service === 'prezi') src = preziParser(src);
    else if (service === 'osf') src = mfrParser(src);
    if (src === ')') src = '';
    const serviceStart = oldPos + 2;
    if (!silent) {
      theState.pos = serviceStart;
      const newState = new theState.md.inline.State(service, theState.md, theState.env, []);
      newState.md.inline.tokenize(newState);
      const token = theState.push('video', '', undefined);
      token.attrPush(['src', src]);
      token.attrPush(['service', service]);
      token.attrPush(['url', match[2]]);
      token.level = theState.level;
    }
    theState.pos += theState.src.indexOf(')', theState.pos);
    return true;
  });
}
