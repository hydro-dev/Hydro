import { dump } from 'js-yaml';
import streamsaver from 'streamsaver';
import { createZipStream } from 'vj/utils/zip';
import pipeStream from 'vj/utils/pipeStream';
import i18n from 'vj/utils/i18n';
import request from 'vj/utils/request';
import Notification from 'vj/components/notification';
import api from 'vj/utils/api';

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

export default async function download(name, targets) {
  if (!window.WritableStream) {
    window.WritableStream = (await import('web-streams-polyfill/dist/ponyfill.es6')).WritableStream;
    streamsaver.WritableStream = window.WritableStream;
  }
  const fileStream = streamsaver.createWriteStream(name);
  let i = 0;
  const zipStream = createZipStream({
    // eslint-disable-next-line consistent-return
    async pull(ctrl) {
      if (i === targets.length) return ctrl.close();
      try {
        if (targets[i].url) {
          const response = await fetch(targets[i].url);
          if (!response.ok) throw response.statusText;
          ctrl.enqueue({
            name: targets[i].filename,
            stream: () => response.body,
          });
        } else {
          ctrl.enqueue({
            name: targets[i].filename,
            stream: () => new Blob([targets[i].content]).stream(),
          });
        }
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        stopDownload();
        Notification.error(i18n('Download Error', [targets[i].filename, e.toString()]));
      }
      i++;
    },
  });
  const abortCallbackReceiver = {};
  function stopDownload() { abortCallbackReceiver.abort(); }
  window.addEventListener('unload', stopDownload);
  window.addEventListener('beforeunload', onBeforeUnload);
  await pipeStream(zipStream, fileStream, abortCallbackReceiver);
  window.removeEventListener('unload', stopDownload);
  window.removeEventListener('beforeunload', onBeforeUnload);
}

export async function downloadProblemSet(pids, name = 'Export') {
  Notification.info('Downloading...');
  const targets = [];
  try {
    for (const pid of pids) {
      const { pdoc } = await request.get(`/d/${UiContext.domainId}/api`);
      await api(gql`
        problem(id: ${pid}) {
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
      `);
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
      targets.push({
        filename: `${pid}/problem.md`,
        content: pdoc.content,
      });
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
    Notification.warn(`${e.error.message} ${e.error.params[0]}`);
  }
}

window.Hydro.components.downloadProblemSet = downloadProblemSet;
window.Hydro.components.download = download;
