import { size } from '@hydrooj/utils/lib/common';
import { getScoreColor, STATUS, STATUS_TEXTS } from '@hydrooj/utils/lib/status';
import { AnsiUp } from 'ansi_up';
import {
  FileFragment, IncompleteTrace, SubtaskResult, TestCase, TraceStack,
} from 'hydrooj';
import _ from 'lodash';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { useSelector } from 'react-redux';
import { STATUS_CODES } from 'vj/constant/record';
import { i18n } from 'vj/utils';
import { RootState } from './reducer';

const AU = new AnsiUp();

export function ansiToHtml(str: string, whiteToBlack = true) {
  const res = AU.ansi_to_html(str);
  return whiteToBlack ? res.replace(/style="color:rgb\(255,255,255\)"/g, 'style="color:black"') : res;
}

function PreTextBox({ lines, innerClass }: { lines: string[], innerClass: string }) {
  if (lines.length === 0) return null;

  return (<div className="section__body">
    <pre className={innerClass} dangerouslySetInnerHTML={{ __html: ansiToHtml(lines.join('\n')) }}></pre>
  </div>);
}

function SubtaskLine({ subtaskId, result }: { subtaskId: number, result: SubtaskResult | null }) {
  const statusCode = result ? STATUS_CODES[result.status] : null;
  const statusText = result ? STATUS_TEXTS[result.status] : null;

  return (<div className="subtask-line">
    <div className="cell">
      {i18n('Subtask {0}').format(subtaskId)}
    </div>
    {result ? <>
      <div className="cell">
        <span className={`icon record-status--icon ${statusCode}`}></span>
        <span className={`record-status--text ${statusCode}`}>
          {statusText}
        </span>
      </div>
      <div className={`cell record-status--text ${statusCode}`}>
        {result.score.toFixed(3)} pt
      </div></> : null}
  </div>);
}

function TraceStackView({ traceStack }: { traceStack: TraceStack }) {
  return (<div>
    <h3 className="section__title">
      {i18n('Trace Stack')}
    </h3>
    <p>
      {i18n('A read error occurred on stream `{0}`.').format(traceStack.streamName)}
    </p>
    <table className="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>{i18n('Var name')}</th>
          <th>{i18n('Line')}</th>
          <th>{i18n('Col')}</th>
          <th>{i18n('Byte')}</th>
        </tr>
      </thead>
      <tbody>
        {
          traceStack.stack.toReversed().map((trace, index) => (
            <tr key={null}>
              <td>{index}</td>
              <td>{trace.varName}</td>
              <td>{trace.lineNum + 1}</td>
              <td>{trace.colNum + 1}</td>
              <td>{trace.byteNum + 1}</td>
            </tr>
          ))
        }
      </tbody>
    </table>
  </div>);
}

function StreamFilePreview({
  stream, streamName, title, subtaskId, caseId, error,
}: {
  stream: FileFragment,
  streamName: string,
  title: string,
  subtaskId: number,
  caseId: number,
  error?: { trace: IncompleteTrace, message: string },
}) {
  const monacoRef = useRef(null);

  useEffect(() => {
    if (monacoRef === null) return () => { };

    let lineDelta = 0;

    let textLineBegin = '';
    if (stream.ignoredLinesBegin) {
      textLineBegin = `[${stream.ignoredBytesBegin - stream.firstLineIgnoredBytesBegin} bytes ...]\n`;
      if (stream.ignoredLinesBegin > 1) lineDelta = stream.ignoredLinesBegin - 1;
    }

    let textColBegin = '';
    if (stream.firstLineIgnoredBytesBegin) {
      textColBegin = `[${stream.firstLineIgnoredBytesBegin} bytes ...]`;
    }

    let textColEnd = '';
    if (stream.lastLineIgnoredBytesEnd) {
      textColEnd = `[... ${stream.lastLineIgnoredBytesEnd} bytes]`;
    }

    let textLineEnd = '';
    if (stream.ignoredLinesEnd) {
      textLineEnd = `\n[... ${stream.ignoredBytesEnd - stream.lastLineIgnoredBytesEnd} bytes]`;
    }

    const model = monaco.editor.createModel(textLineBegin + textColBegin + stream.content + textColEnd + textLineEnd,
      'plaintext', monaco.Uri.parse(`hydro-record://${subtaskId}/${caseId}/${streamName}`));

    const lineCount = model.getLineCount();

    const lineNumbers = (x: number): string => {
      if (stream.ignoredLinesBegin > 1 && x === 1) {
        return '...';
      }
      if (stream.ignoredLinesBegin > 1 && x === lineCount) {
        return '...';
      }
      return (x + lineDelta).toString();
    };

    if (error) {
      monaco.editor.setModelMarkers(model, 'owner', [{
        message: i18n('Error reading variable `{0}` at byte {1}: {2}').format(error.trace.varName, error.trace.byteNum + 1, error.message),
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: error.trace.lineNum - lineDelta + 1,
        startColumn: error.trace.colNum - stream.firstLineIgnoredBytesBegin + textColBegin.length + 1,
        endLineNumber: error.trace.lineNum - stream.firstLineIgnoredBytesBegin - lineDelta + 1,
        endColumn: error.trace.colNum - stream.firstLineIgnoredBytesBegin + textColBegin.length + 2,
      }]);
    }

    const editor = monaco.editor.create(monacoRef.current, {
      model,
      readOnly: true,
      minimap: { enabled: false },
      lineNumbers,
      renderValidationDecorations: 'on',
      automaticLayout: true,
    });

    if (error) {
      editor.createDecorationsCollection([
        {
          range: new monaco.Range(error.trace.lineNum - lineDelta + 1, 1, error.trace.lineNum - lineDelta + 1, 1),
          options: {
            isWholeLine: true,
            className: 'custom-error-line',
          },
        },
      ]);
    }

    const lastLineWithContent = stream.ignoredLinesEnd ? lineCount - 1 : lineCount;
    console.debug(stream.ignoredLinesBegin ? 2 : 1, textColBegin.length + 1);
    editor.createDecorationsCollection([
      {
        range: new monaco.Range(1, 1, stream.ignoredLinesBegin ? 2 : 1, textColBegin.length + 1),
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
      }],
    );

    return () => {
      editor.dispose();
      model.dispose();
    };
  }, [monacoRef]);

  return (<div>
    <h3 className="section__title">
      {i18n(title)}
    </h3>
    <div ref={monacoRef} className="monaco-target"></div>
  </div>);
}

function CaseDetails({ testCase, subtaskId }: { testCase: TestCase, subtaskId: number }) {
  return (
    <div className='details'>
      {testCase.message ? <div>
        <h3 className="section__title">
          {i18n('Checker Message')}
        </h3>
        <div>
          <pre>{testCase.message}</pre>
        </div>
      </div> : null}
      {testCase.traceStack ? <TraceStackView traceStack={testCase.traceStack} /> : null}
      {[
        ['inf', 'Input File'],
        ['ouf', 'Output File'],
        ['ans', 'Answer File'],
        ['fromUser', 'User Output'],
        ['toUser', 'Interactor Output']].map(([stream, title]) =>
        (testCase[stream]
          ? <StreamFilePreview
            key={stream}
            stream={testCase[stream]}
            streamName={stream}
            title={title}
            subtaskId={subtaskId}
            caseId={testCase.id}
            error={
              testCase.traceStack && testCase.traceStack.streamName === stream && testCase.traceStack.stack.length
                ? { trace: testCase.traceStack.stack.at(-1), message: testCase.message } : null} />
          : null))}
    </div>
  );
}

function Case({ testCase, subtaskId }: { testCase: TestCase, subtaskId: number }) {
  const statusCode = STATUS_CODES[testCase.status];
  const statusText = STATUS_TEXTS[testCase.status];
  const statusIsLimitExceeded = [
    STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
  ].includes(testCase.status);

  const [expanded, setExpanded] = useState(false);

  function handleClick() {
    setExpanded(!expanded);
  }

  return (
    <div className={`case record-status--border ${statusCode}`}>
      <div className="case-line" onClick={handleClick}>
        <div className="cell">
          <span className="expand-icon">
            <span className={`icon ${expanded ? 'icon-expand_less' : 'icon-expand_more'}`}></span>
          </span>
          <span>{i18n('Test {0}').format(testCase.id)}</span>
        </div>
        <div className="cell">
          <span className={`icon record-status--icon ${statusCode}`}></span>
          <span className={`record-status--text ${statusCode}`}>
            {statusText}
          </span>
        </div>
        <div className={`cell record-status--text ${statusCode}`}>
          {testCase.scaledScore !== undefined ? `${(testCase.scaledScore * 100).toFixed(3)}%` : testCase.score.toFixed(3)} pt
        </div>
        <div className="cell">
          {statusIsLimitExceeded ? '>' : ''}{testCase.time.toFixed(0)} ms
        </div>
        <div className="cell">
          {statusIsLimitExceeded ? '>' : ''}{size(testCase.memory, 1024)}
        </div>
      </div>
      {expanded ? <CaseDetails testCase={testCase} subtaskId={subtaskId} /> : null}
    </div>
  );
}

function Subtask({
  subtaskId, result, testCases, singleSubtask,
}: { subtaskId: number, result: SubtaskResult | null, testCases: TestCase[], singleSubtask: boolean }) {
  const sortedTestCases = useMemo(() =>
    testCases.map((t, idx) => ({ ...t, id: t.id === undefined ? idx : t.id }))
      .sort((a, b) => a.id - b.id), [testCases]);

  return (<div className="subtask">
    {singleSubtask ? null : <SubtaskLine subtaskId={subtaskId} result={result} />}
    {
      sortedTestCases.map((testCase) => <Case key={testCase.id} testCase={testCase} subtaskId={subtaskId} />)
    }
  </div>);
}

function TestCasesWrapper() {
  // hydro 的 subtask 可能会被整个 skip
  // 有可能出现存在一个 testCase 的 subtaskId 是 x，但是 x not in Object.keys(subtasks) 的情况
  const subtasks = useSelector((state: RootState) => state.rdoc.subtasks);
  const testCases = useSelector((state: RootState) => state.rdoc.testCases);
  const testCasesGroups = useMemo(() => _.groupBy(testCases, (t) => t.subtaskId), [testCases]);

  if (testCases.length === 0) return null;

  const singleSubtask = Object.keys(testCasesGroups).length === 1;

  return (<div className="section__body no-padding">
    {
      Object.entries(testCasesGroups)
        .map<[number, TestCase[]]>(([id, t]) => [parseInt(id, 10), t])
        .sort((a, b) => a[0] - b[0])
        .map(([subtaskId, testCasesInSubtask]) =>
          <Subtask
            key={subtaskId}
            subtaskId={subtaskId}
            result={subtasks[subtaskId] || null}
            testCases={testCasesInSubtask}
            singleSubtask={singleSubtask} />)
    }
  </div>);
}

function RecordDetailStatusLoaded() {
  const status = useSelector((state: RootState) => state.rdoc.status);
  const statusCode = STATUS_CODES[status];
  const statusText = STATUS_TEXTS[status];

  const score = useSelector((state: RootState) => state.rdoc.score || 0);
  const progress = useSelector((state: RootState) => state.rdoc.progress);

  const compilerTexts = useSelector((state: RootState) => state.rdoc.compilerTexts);
  const judgeTexts = useSelector((state: RootState) => state.rdoc.judgeTexts);

  return (<>
    <div className="section__header">
      <h1 className="section__title">
        <span className={`icon record-status--icon ${statusCode}`}></span>
        <span style={{ color: getScoreColor(score) }}>{score}</span>
        <span className={`record-status--text ${statusCode}`}> {statusText} </span>
        {progress ? `${progress.toFixed(3)}%` : null}
      </h1>
    </div>
    <PreTextBox lines={compilerTexts} innerClass='compiler-text' />
    <PreTextBox lines={judgeTexts.map((text) => {
      if (typeof text === 'string') return text;
      return i18n(text.message).format(...text.params || []) + ((process.env.DEV && text.stack) ? `\n${text.stack}` : '');
    })} innerClass='judge-text' />
    <TestCasesWrapper />
  </>);
}

export default function RecordDetailStatus() {
  const loaded = useSelector((state: RootState) => state.__loaded);

  return loaded ? <RecordDetailStatusLoaded /> : null;
}
