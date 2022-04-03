import { dump } from 'js-yaml';
import streamsaver from 'streamsaver';
import { createZipStream } from 'vj/utils/zip';
import pipeStream from 'vj/utils/pipeStream';
import i18n from 'vj/utils/i18n';
import request from 'vj/utils/request';
import PQueue from 'p-queue/dist/index';
import Notification from 'vj/components/notification';
import api, { gql } from 'vj/utils/api';

let isBeforeUnloadTriggeredByLibrary = !window.isSecureContext;
function onBeforeUnload(e) {
  if (isBeforeUnloadTriggeredByLibrary) {
    isBeforeUnloadTriggeredByLibrary = false;
    return;
  }
  e.returnValue = '';
}
if (window.location.protocol === 'https:'
  || window.location.protocol === 'chrome-extension:'
  || window.location.hostname === 'localhost') {
  streamsaver.mitm = '/streamsaver/mitm.html';
}

const waitForWritableStream = window.WritableStream
  ? Promise.resolve()
  : import('web-streams-polyfill/dist/ponyfill.es6').then(({ WritableStream }) => {
    window.WritableStream = WritableStream;
    streamsaver.WritableStream = window.WritableStream;
  });

export default async function download(filename, targets) {
  await waitForWritableStream;
  const fileStream = streamsaver.createWriteStream(filename);
  const queue = new PQueue({ concurrency: 5 });
  const abortCallbackReceiver = {};
  function stopDownload() { abortCallbackReceiver.abort(); }
  let i = 0;
  async function downloadFile(target) {
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
      stopDownload();
      Notification.error(i18n('Download Error', [target.filename, e.toString()]));
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

export async function downloadProblemSet(pids, name = 'Export') {
  Notification.info(i18n('Downloading...'));
  const targets = [];
  try {
    for (const pid of pids) {
      const pdoc = await api(gql`
        problem(id: ${+pid}) {
          pid
          owner
          title
          content
          tag
          nSubmit
          nAccept
          data {
            name
          }
          additional_file {
            name
          }
        }
      `, ['data', 'problem']);
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
        if (c instanceof Array || typeof c === 'string') throw new Error();
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
    Notification.error(`${e.message} ${e.params?.[0]}`);
  }
}

window.Hydro.components.downloadProblemSet = downloadProblemSet;
window.Hydro.components.download = download;
