import $ from 'jquery';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { NamedPage } from 'vj/misc/Page';

export default new NamedPage('record_detail', async () => {
  if (!UiContext.socketUrl) return;
  const [{ default: WebSocket }, { DiffDOM }] = await Promise.all([
    import('../components/socket'),
    import('diff-dom'),
  ]);

  const sock = new WebSocket(UiContext.ws_prefix + UiContext.socketUrl, false, true);
  const dd = new DiffDOM();
  sock.onmessage = (_, data) => {
    const msg = JSON.parse(data);
    const newStatus = $(msg.status_html);
    const oldStatus = $('#status');
    dd.apply(oldStatus[0], dd.diff(oldStatus[0], newStatus[0]));
    const newSummary = $(msg.summary_html);
    const oldSummary = $('#summary');
    dd.apply(oldSummary[0], dd.diff(oldSummary[0], newSummary[0]));
    if (typeof msg.status === 'number' && window.parent) window.parent.postMessage({ status: msg.status });
  };

  $(document).on('click', '.case-line', function () {
    $(this).parent().toggleClass('expanded');

    $(this).parent().find('textarea[data-editor]').toArray().forEach((el: HTMLTextAreaElement) => {
      const content = el.value;
      const streamName = el.dataset.streamName.toString();
      const subtaskId = $(el).parents('.subtask')[0].dataset.subtaskId.toString();
      const caseId = $(el).parents('.case')[0].dataset.caseId.toString();

      const ignoredLinesBegin = parseInt(el.dataset.ignoredLinesBegin, 10);
      const ignoredLinesEnd = parseInt(el.dataset.ignoredLinesEnd, 10);
      const ignoredBytesBegin = parseInt(el.dataset.ignoredBytesBegin, 10);
      const ignoredBytesEnd = parseInt(el.dataset.ignoredBytesEnd, 10);
      const firstLineIgnoredBytesBegin = parseInt(el.dataset.firstLineIgnoredBytesBegin, 10);
      const lastLineIgnoredBytesEnd = parseInt(el.dataset.lastLineIgnoredBytesEnd, 10);

      let errorLine: number | undefined;
      let errorCol: number | undefined;
      let errorMsg: string | undefined;

      let lineDelta = 0;

      let textLineBegin = '';
      if (ignoredLinesBegin) {
        textLineBegin = `[${ignoredBytesBegin - firstLineIgnoredBytesBegin} bytes ...]\n`;
        if (ignoredLinesBegin > 1) lineDelta = ignoredLinesBegin - 1;
      }

      let textColBegin = '';
      if (firstLineIgnoredBytesBegin) {
        textColBegin = `[${firstLineIgnoredBytesBegin} bytes ...]`;
      }

      let textColEnd = '';
      if (lastLineIgnoredBytesEnd) {
        textColEnd = `[... ${lastLineIgnoredBytesEnd} bytes]`;
      }

      let textLineEnd = '';
      if (ignoredLinesEnd) {
        textLineEnd = `\n[... ${ignoredBytesEnd - lastLineIgnoredBytesEnd} bytes]`;
      }

      const model = monaco.editor.createModel(textLineBegin + textColBegin + content + textColEnd + textLineEnd,
        'plaintext', monaco.Uri.parse(`hydro-record://${subtaskId}/${caseId}/${streamName}`));

      const lineCount = model.getLineCount();

      const lineNumbers = (x: number): string => {
        if (ignoredLinesBegin > 1 && x === 1) {
          return '...';
        }
        if (ignoredLinesBegin > 1 && x === lineCount) {
          return '...';
        }
        return (x + lineDelta).toString();
      };

      if (el.dataset.errorLine !== undefined) {
        errorLine = parseInt(el.dataset.errorLine, 10);
        errorCol = parseInt(el.dataset.errorCol, 10);
        errorMsg = el.dataset.errorMsg.toString();
        monaco.editor.setModelMarkers(model, 'owner', [{
          message: errorMsg,
          severity: monaco.MarkerSeverity.Error,
          startLineNumber: errorLine - lineDelta + 1,
          startColumn: errorCol - firstLineIgnoredBytesBegin + textColBegin.length + 1,
          endLineNumber: errorLine - firstLineIgnoredBytesBegin - lineDelta + 1,
          endColumn: errorCol - firstLineIgnoredBytesBegin + textColBegin.length + 2,
        }]);
      }

      const parent = el.parentElement;
      parent.removeChild(el);
      const wrap = parent.querySelector('.monaco-target') as HTMLElement;

      const editor = monaco.editor.create(wrap, {
        model,
        readOnly: true,
        minimap: { enabled: false },
        lineNumbers,
        renderValidationDecorations: 'on',
        automaticLayout: true,
      });

      if (errorLine !== undefined) {
        editor.createDecorationsCollection([
          {
            range: new monaco.Range(errorLine - lineDelta + 1, 1, errorLine - lineDelta + 1, 1),
            options: {
              isWholeLine: true,
              className: 'custom-error-line',
            },
          },
        ]);
      }

      const lastLineWithContent = ignoredLinesEnd ? lineCount - 1 : lineCount;
      console.debug(ignoredLinesBegin ? 2 : 1, textColBegin.length + 1);
      editor.createDecorationsCollection([
        {
          range: new monaco.Range(1, 1, ignoredLinesBegin ? 2 : 1, textColBegin.length + 1),
          options: {
            isWholeLine: false,
            inlineClassName: 'custom-ignore-bytes',
          },
        },
        {
          range: new monaco.Range(
            lastLineWithContent,
            model.getLineContent(lastLineWithContent).length - textColEnd.length + 1,
            lineCount,
            model.getLineContent(lineCount).length + 1),
          options: {
            isWholeLine: false,
            inlineClassName: 'custom-ignore-bytes',
          },
        },
      ]);
    });
  });
});
