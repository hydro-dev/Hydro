import 'streamsaver/examples/zip-stream';

import { request } from './base';
import { openDB } from './db';

export async function api(method: string, args: Record<string, any>, projection?: any) {
  const res = await request.post(`/d/${UiContext.domainId}/api/${encodeURIComponent(method)}`, { args, projection });
  if (res.error) throw new Error(res.error);
  return res;
}

interface DomainInfoCache {
  id: string;
  version: number;
  domain: Record<string, any>;
}

const domainInfoCacheStore = 'domain-info';
let domainInfoPromise: Promise<Record<string, any>> | null = null;

async function readDomainInfoCache(domainId: string) {
  return await (await openDB).get(domainInfoCacheStore, domainId) as DomainInfoCache | null;
}

async function writeDomainInfoCache(cache: DomainInfoCache) {
  await (await openDB).put(domainInfoCacheStore, cache);
}

async function loadDomainInfo() {
  let cached: DomainInfoCache | null = null;
  try {
    cached = await readDomainInfoCache(UiContext.domainId);
  } catch (e) { }
  if (cached && cached.version >= UiContext.domainVersion) return cached.domain;
  const res = await api('domain.current', {});
  const { domain } = res;
  if (!domain) throw new Error('Failed to load domain info');
  writeDomainInfoCache({ id: UiContext.domainId, version: UiContext.domainVersion, domain }).catch(() => { });
  return domain;
}

export function getDomainInfo() {
  domainInfoPromise ||= loadDomainInfo().catch((e) => {
    domainInfoPromise = null;
    throw e;
  });
  return domainInfoPromise;
}

export function getAvailableLangs(langsList?: string[]) {
  const prefixes = new Set(Object.keys(window.LANGS).filter((i) => i.includes('.')).map((i) => i.split('.')[0]));
  const Langs = {};
  for (const key in window.LANGS) {
    if (prefixes.has(key)) continue;
    if ((langsList instanceof Array) && !langsList.includes(key)) continue;
    if (window.LANGS[key].hidden && !langsList?.includes(key)) continue;
    if (window.LANGS[key].disabled) continue;
    Langs[key] = window.LANGS[key];
  }
  return Langs;
}

export const createZipStream = (window as any).ZIP;

export function createZipBlob(underlyingSource) {
  return new Response(createZipStream(underlyingSource)).blob();
}

export async function pipeStream(read, write, abort) {
  if (window.WritableStream && read.pipeTo) {
    const abortController = new AbortController();
    if (abort) abort.abort = abortController.abort.bind(abortController);
    await read.pipeTo(write, abortController);
  } else {
    const writer = write.getWriter();
    if (abort) abort.abort = writer.abort.bind(writer);
    const reader = read.getReader();
    while (1) {
      const readResult = await reader.read();
      if (readResult.done) {
        writer.close();
        break;
      } else writer.write(readResult.value);
    }
  }
}

// https://github.com/andrasq/node-mongoid-js/blob/master/mongoid.js
export function mongoId(idstring: string) {
  if (typeof idstring !== 'string') idstring = String(idstring);
  return {
    timestamp: Number.parseInt(idstring.slice(0, 0 + 8), 16),
    machineid: Number.parseInt(idstring.slice(8, 8 + 6), 16),
    pid: Number.parseInt(idstring.slice(14, 14 + 4), 16),
    sequence: Number.parseInt(idstring.slice(18, 18 + 6), 16),
  };
}

export function emulateAnchorClick(ev: KeyboardEvent, targetUrl: string, alwaysOpenInNewWindow = false) {
  let openInNewWindow;
  if (alwaysOpenInNewWindow) openInNewWindow = true;
  else openInNewWindow = (ev.ctrlKey || ev.shiftKey || ev.metaKey);
  if (openInNewWindow) window.open(targetUrl);
  else window.location.href = targetUrl;
}

export * from './base';
export { default as base64 } from './base64';
export { default as loadReactRedux } from './loadReactRedux';
export * as mediaQuery from './mediaQuery';
export { default as pjax } from './pjax';
export * from './slide';
