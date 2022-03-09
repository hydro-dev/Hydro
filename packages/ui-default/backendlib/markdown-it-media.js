/* eslint-disable max-len */
/* eslint-disable prefer-destructuring */

const { randomUUID } = require('crypto');
const { escapeHtml } = require('markdown-it/lib/common/utils');

/* eslint-disable no-restricted-properties */
const ytRegex = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
function youtubeParser(url) {
  const match = url.match(ytRegex);
  return match && match[7].length === 11 ? match[7] : url;
}
const vimeoRegex = /https?:\/\/(?:www\.|player\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/([^/]*)\/videos\/|album\/(\d+)\/video\/|)(\d+)(?:$|\/|\?)/;
function vimeoParser(url) {
  const match = url.match(vimeoRegex);
  return match && typeof match[3] === 'string' ? match[3] : url;
}
const vineRegex = /^http(?:s?):\/\/(?:www\.)?vine\.co\/v\/([a-zA-Z0-9]{1,13}).*/;
function vineParser(url) {
  const match = url.match(vineRegex);
  return match && match[1].length === 11 ? match[1] : url;
}
const preziRegex = /^https:\/\/prezi.com\/(.[^/]+)/;
function preziParser(url) {
  const match = url.match(preziRegex);
  return match ? match[1] : url;
}
// TODO: Write regex for staging and local servers.
const mfrRegex = /^http(?:s?):\/\/(?:www\.)?mfr\.osf\.io\/render\?url=http(?:s?):\/\/osf\.io\/([a-zA-Z0-9]{1,5})\/\?action=download/;
function mfrParser(url) {
  const match = url.match(mfrRegex);
  return match ? match[1] : url;
}
const EMBED_REGEX = /@\[([a-zA-Z].+?)]\((.*?)[)]/im;
function extractVideoParameters(url) {
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
function videoUrl(service, videoID, url, options) {
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
        startTime += Number(timeParts.pop()) * Math.pow(60, j);
        j += 1;
      }
      parameters.set('start', startTime);
      parameters.delete('t');
    }
    parameters.delete('v');
    parameters.delete('feature');
    parameters.delete('origin');
    const parameterArray = Array.from(parameters, (p) => p.join('='));
    const parameterPos = videoID.indexOf('?');
    let finalUrl = 'https://www.youtube';
    if (options.youtube.nocookie || url.indexOf('youtube-nocookie.com') > -1) finalUrl += '-nocookie';
    finalUrl += `.com/embed/${parameterPos > -1 ? videoID.substr(0, parameterPos) : videoID}`;
    if (parameterArray.length > 0) finalUrl += `?${parameterArray.join('&')}`;
    return finalUrl;
  }
  if (service === 'vimeo') return `https://player.vimeo.com/video/${videoID}`;
  if (service === 'vine') return `https://vine.co/v/${videoID}/embed/${options.vine.embed}`;
  if (service === 'prezi') {
    return `https://prezi.com/embed/${videoID}/?bgcolor=ffffff&amp;lock_to_path=0&amp;autoplay=0&amp;autohide_ctrls=0&amp;`
      + 'landing_data=bHVZZmNaNDBIWnNjdEVENDRhZDFNZGNIUE43MHdLNWpsdFJLb2ZHanI5N1lQVHkxSHFxazZ0UUNCRHloSXZROHh3PT0&amp;'
      + 'landing_sign=1kD6c0N6aYpMUS0wxnQjxzSqZlEB8qNFdxtdjYhwSuI';
  }
  if (service === 'osf') return `https://mfr.osf.io/render?url=https://osf.io/${videoID}/?action=download`;
  return videoID;
}

module.exports = function videoPlugin(md) {
  const options = {
    url: videoUrl,
    video: videoUrl,
    youtube: { width: 640, height: 390, nocookie: false },
    vimeo: { width: 500, height: 281 },
    vine: { width: 600, height: 600, embed: 'simple' },
    prezi: { width: 550, height: 400 },
    osf: { width: '100%', height: '100%' },
    pdf: videoUrl,
  };
  md.renderer.rules.video = function tokenizeReturn(tokens, idx) {
    let videoID = md.utils.escapeHtml(tokens[idx].videoID);
    const service = md.utils.escapeHtml(tokens[idx].service).toLowerCase();
    const checkUrl = /http(?:s?):\/\/(?:www\.)?[a-zA-Z0-9-:.]{1,}\/render(?:\/)?[a-zA-Z0-9.&;?=:%]{1,}url=http(?:s?):\/\/[a-zA-Z0-9 -:.]{1,}\/[a-zA-Z0-9]{1,5}\/\?[a-zA-Z0-9.=:%]{1,}/;
    let num;
    if (service === 'osf' && videoID) {
      num = Math.random() * 0x10000;
      if (videoID.match(checkUrl)) {
        return `<div id="${num}" class="mfr mfr-file"></div><script>`
          + `$(document).ready(function () {new mfr.Render("${num}", "${videoID}");`
          + '    }); </script>';
      }
      return `<div id="${num}" class="mfr mfr-file"></div><script>`
        + `$(document).ready(function () {new mfr.Render("${num}", "https://mfr.osf.io/`
        + `render?url=https://osf.io/${videoID}/?action=download%26mode=render");`
        + '    }); </script>';
    }
    if (service === 'pdf') {
      if (videoID.startsWith('file://')) videoID += videoID.includes('?') ? '&noDisposition=1' : '?noDisposition=1';
      return `\
        <object classid="clsid:${randomUUID().toUpperCase()}">
          <param name="SRC" value="${videoID}" >
          <embed width="100%" style="min-height: 100vh;border: none;" fullscreen="yes" src="${videoID}">
            <noembed></noembed>
          </embed>
        </object>`;
    }
    if (['url', 'video'].includes(service)) {
      return `\
        <video width="100%" controls>
          <source src="${videoID}" type="${videoID.endsWith('ogg') ? 'video/ogg' : 'video/mp4'}">
          Your browser doesn't support video tag.
        </video>`;
    }
    if (options[service]?.width) {
      return `<div class="embed-responsive embed-responsive-16by9">
      <iframe class="embed-responsive-item ${service}-player" type="text/html" width="${options[service].width || 640}"\
        height="${options[service].height || 390}"\
        src="${options.url(service, videoID, tokens[idx].url, options)}"
        frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe></div>`;
    }
    return `<div data-${service}>${escapeHtml(videoID)}</div>`;
  };
  md.inline.ruler.before('emphasis', 'video', (state, silent) => {
    let token;
    let videoID;
    const theState = state;
    const oldPos = state.pos;
    if (state.src.charCodeAt(oldPos) !== 0x40
      ||/* @ */ state.src.charCodeAt(oldPos + 1) !== 0x5B/* [ */) {
      return false;
    }
    const match = EMBED_REGEX.exec(state.src.slice(state.pos, state.src.length));
    if (!match || match.length < 3) return false;
    const service = match[1];
    videoID = match[2];
    const serviceLower = service.toLowerCase();
    if (serviceLower === 'youtube') videoID = youtubeParser(videoID);
    else if (serviceLower === 'vimeo') videoID = vimeoParser(videoID);
    else if (serviceLower === 'vine') videoID = vineParser(videoID);
    else if (serviceLower === 'prezi') videoID = preziParser(videoID);
    else if (serviceLower === 'osf') videoID = mfrParser(videoID);
    if (videoID === ')') videoID = '';
    const serviceStart = oldPos + 2;
    const serviceEnd = md.helpers.parseLinkLabel(state, oldPos + 1, false);
    if (!silent) {
      theState.pos = serviceStart;
      theState.service = theState.src.slice(serviceStart, serviceEnd);
      const newState = new theState.md.inline.State(service, theState.md, theState.env, []);
      newState.md.inline.tokenize(newState);
      token = theState.push('video', '');
      token.videoID = videoID;
      token.service = service;
      token.url = match[2];
      token.level = theState.level;
    }
    theState.pos += theState.src.indexOf(')', theState.pos);
    return true;
  });
};
