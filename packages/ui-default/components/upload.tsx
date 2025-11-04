import { MantineProvider, Progress } from '@mantine/core';
import $ from 'jquery';
import React from 'react';
import { Dialog } from 'vj/components/dialog/index';
import Notification from 'vj/components/notification';
import {
  delay, i18n, pjax, request, tpl,
} from 'vj/utils';

function onBeforeUnload(e) {
  e.returnValue = '';
}

interface UploadOptions {
  type?: string;
  pjax?: boolean;
  sidebar?: boolean;
  singleFileUploadCallback?: (file: File) => any;
  filenameCallback?: (file: File) => string;
}
export default async function uploadFiles(endpoint = '', files: File[] | FileList = [], options: UploadOptions = {}) {
  let fileLabel = '';
  let uploadLabel = '';
  let fileProgress = 0;
  let uploadProgress = 0;
  let render = () => { };

  function ProgressDialog() {
    const [, setRender] = React.useState(0);
    React.useEffect(() => {
      render = () => setRender((r) => r + 1);
    }, []);
    return <MantineProvider>
      <div
        style={{
          textAlign: 'center', marginBottom: '5px', color: 'gray', fontSize: 'small',
        }}
      >{uploadLabel}</div>
      <Progress value={uploadProgress} />
      <div
        style={{
          textAlign: 'center', margin: '5px 0', color: 'gray', fontSize: 'small',
        }}
      >{fileLabel}</div>
      <Progress value={fileProgress} />
    </MantineProvider>;
  }

  const dialog = new Dialog({
    $body: $(tpl(<ProgressDialog />, true)),
  });
  try {
    Notification.info(i18n('Uploading files...'));
    window.addEventListener('beforeunload', onBeforeUnload);
    dialog.open();
    for (const i in files) {
      if (Number.isNaN(+i)) continue;
      const file = files[i];
      const data = new FormData();
      data.append('filename', options.filenameCallback?.(file) || file.name);
      data.append('file', file);
      if (options.type) data.append('type', options.type);
      data.append('operation', 'upload_file');
      await request.postFile(endpoint, data, {
        xhr() { // eslint-disable-line
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener('loadstart', () => {
            uploadLabel = `[${+i + 1}/${files.length}] ${file.name} `;
            uploadProgress = Math.round((+i + 1) / files.length * 100);
            fileLabel = i18n('Uploading... ({0}%)', 0);
            fileProgress = 0;
            render();
          });
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded / e.total) * 100);
              if (percentComplete === 100) fileLabel = i18n('Processing...');
              else fileLabel = i18n('Uploading... ({0}%)', percentComplete);
              fileProgress = percentComplete;
              render();
            }
          }, false);
          return xhr;
        },
      });
      await options.singleFileUploadCallback?.(file);
    }
    window.removeEventListener('beforeunload', onBeforeUnload);
    Notification.success(i18n('File uploaded successfully.'));
    if (options.pjax) {
      let params = '';
      if (options.type) params += `?d=${encodeURIComponent(options.type)}`;
      if (options.sidebar) params += `${params ? '&' : '?'}sidebar=true`;
      await pjax.request({ push: false, url: `${endpoint}${params || ''}` });
    }
  } catch (e) {
    console.error(e);
    Notification.error(i18n('File upload failed: {0}', e.toString()));
  } finally {
    await delay(500);
    dialog.close();
  }
}
