import { sleep } from '@hydrooj/utils/lib/common';
import { dump } from 'js-yaml';
import PQueue from 'p-queue';
import streamsaver from 'streamsaver';
import Notification from 'vj/components/notification';
import {
  api, createZipStream, i18n, pipeStream, request,
} from 'vj/utils';
import { ctx } from '../../context';

let isBeforeUnloadTriggeredByLibrary = !window.isSecureContext;
function onBeforeUnload(e) {
  if (isBeforeUnloadTriggeredByLibrary) {
    isBeforeUnloadTriggeredByLibrary = false;
    return;
  }
  e.returnValue = '';
}
streamsaver.mitm = `${window.isSecureContext ? '' : 'https://hydro.ac'}/streamsaver/mitm.html`;

const waitForWritableStream = window.WritableStream
  ? Promise.resolve()
  : import('web-streams-polyfill').then(({ WritableStream }) => {
    window.WritableStream = WritableStream as any;
    streamsaver.WritableStream = window.WritableStream;
  });

export default async function download(filename, targets) {
  await waitForWritableStream;
  const fileStream = streamsaver.createWriteStream(filename);
  const queue = new PQueue({ concurrency: 5 });
  const abortCallbackReceiver: any = {};
  function stopDownload() { abortCallbackReceiver.abort?.(); }
  let i = 0;
  async function downloadFile(target, retry = 5) {
    try {
      let stream;
      if (target.url) {
        const response = await fetch(target.url);
        if (!response.ok) throw response.statusText;
        stream = response.body;
      } else {
        stream = new Blob([target.content]).stream();
      }
      return {
        name: target.filename,
        stream,
      };
    } catch (e) {
      if (retry) {
        Notification.warn(i18n('Download Error: {0} {1}, retry in 3 secs...', [target.filename, e.toString()]));
        await sleep(3000);
        return await downloadFile(target, retry - 1);
      }
      window.captureException?.(e);
      stopDownload();
      Notification.error(i18n('Download Error: {0} {1}', [target.filename, e.toString()]));
    }
    return {};
  }
  const handles = [];
  for (const target of targets) {
    handles.push(queue.add(() => downloadFile(target)));
  }
  queue.start();
  const zipStream = createZipStream({
    // eslint-disable-next-line consistent-return
    async pull(ctrl) {
      if (!handles[i]) return ctrl.close();
      const { name, stream } = await handles[i];
      i++;
      ctrl.enqueue({
        name,
        stream: () => stream,
      });
    },
  });
  window.addEventListener('unload', stopDownload);
  window.addEventListener('beforeunload', onBeforeUnload);
  await pipeStream(zipStream, fileStream, abortCallbackReceiver);
  window.removeEventListener('unload', stopDownload);
  window.removeEventListener('beforeunload', onBeforeUnload);
}

declare module '../../api' {
  interface EventMap {
    'problemset/download': (pids: number[], name: string, targets: { filename: string, url?: string, content?: string }[]) => void;
  }
}

export async function downloadProblemSet(pids, name = 'Export') {
  Notification.info(i18n('Downloading...'));
  const targets: { filename: string, url?: string, content?: string }[] = [];
  try {
    await ctx.serial('problemset/download', pids, name, targets);
    for (const pid of pids) {
      const pdoc = await api('problem', { id: +pid }, {
        pid: 1,
        owner: 1,
        title: 1,
        content: 1,
        tag: 1,
        nSubmit: 1,
        nAccept: 1,
        data: {
          name: 1,
        },
        additional_file: {
          name: 1,
        },
      });
      targets.push({
        filename: `${pid}/problem.yaml`,
        content: dump({
          pid: pdoc.pid,
          owner: pdoc.owner,
          title: pdoc.title,
          tag: pdoc.tag,
          nSubmit: pdoc.nSubmit,
          nAccept: pdoc.nAccept,
        }),
      });
      try {
        const c = JSON.parse(pdoc.content);
        if (c instanceof Array || typeof c === 'string') throw new Error('Invalid content');
        for (const key of Object.keys(c)) {
          targets.push({
            filename: `${pid}/problem_${key}.md`,
            content: typeof c[key] === 'string' ? c[key] : JSON.stringify(c[key]),
          });
        }
      } catch (e) {
        targets.push({
          filename: `${pid}/problem.md`,
          content: pdoc.content,
        });
      }
      let { links } = await request.post(
        `/d/${UiContext.domainId}/p/${pid}/files`,
        { operation: 'get_links', files: (pdoc.data || []).map((i) => i.name), type: 'testdata' },
      );
      for (const filename of Object.keys(links)) {
        targets.push({ filename: `${pid}/testdata/${filename}`, url: links[filename] });
      }
      ({ links } = await request.post(`/d/${UiContext.domainId}/p/${pid}/files`, {
        operation: 'get_links', files: (pdoc.additional_file || []).map((i) => i.name), type: 'additional_file',
      }));
      for (const filename of Object.keys(links)) {
        targets.push({ filename: `${pid}/additional_file/${filename}`, url: links[filename] });
      }
    }
    await download(`${name}.zip`, targets);
  } catch (e) {
    window.captureException?.(e);
    Notification.error(`${e.message} ${e.params?.[0]}`);
  }
}
