import { size } from '@hydrooj/utils/lib/common';
import { getScoreColor, STATUS, STATUS_TEXTS } from '@hydrooj/utils/lib/status';
import { AnsiUp } from 'ansi_up';
import {
  FileFragment, IncompleteTrace, SubtaskResult, TestCase, TraceStack,
} from 'hydrooj';
import _ from 'lodash';
import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { useSelector } from 'react-redux';
import { STATUS_CODES } from 'vj/constant/record';
import { i18n } from 'vj/utils';
import prism from '../highlighter/prismjs';
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
            <tr key={index}>
              <td>{index}</td>
              <td>{trace.varName}</td>
              <td>{trace.pos.line + 1}</td>
              <td>{trace.pos.col + 1}</td>
              <td>{trace.pos.byte + 1}</td>
            </tr>
          ))
        }
      </tbody>
    </table>
  </div>);
}

function StreamFilePreview({
  stream, title, errorTrace,
}: {
  stream: FileFragment,
  title: string,
  errorTrace?: IncompleteTrace
}) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elRef.current) return;

    const $dom = $(elRef.current);
    prism.highlightBlocks($dom);
  }, [stream, elRef]);

  const omitBytesLeft = stream.pos.begin.byte;
  const omitBytesRight = stream.length - stream.pos.end.byte;

  return (<div>
    <h3 className="section__title">
      {i18n(title)}
    </h3>
    <div className="stream-wrap" ref={elRef}>
      <pre
        className="line-numbers"
        data-start={stream.pos.begin.line + 1}
        {...(errorTrace ? { 'data-line-offset': stream.pos.begin.line, 'data-line': errorTrace.pos.line } : {})}
        data-line-offset={stream.pos.begin.line}
      >
        {omitBytesLeft ? <><div>{i18n('{0} bytes omitted').format(omitBytesLeft)}</div><hr /></> : null}
        <code>{stream.content}</code>
        {omitBytesRight ? <><hr /><div>{i18n('{0} bytes omitted').format(omitBytesRight)}</div></> : null}
      </pre>
    </div>
  </div>);
}

function CaseDetails({ testCase }: { testCase: TestCase }) {
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
        (testCase.streams && testCase.streams[stream]
          ? <StreamFilePreview
            key={stream}
            stream={testCase.streams[stream]}
            title={title}
            errorTrace={
              testCase.traceStack && testCase.traceStack.streamName === stream && testCase.traceStack.stack.length
                ? testCase.traceStack.stack.at(-1) : null} />
          : null))}
    </div>
  );
}

function Case({ testCase }: { testCase: TestCase }) {
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
      {expanded ? <CaseDetails testCase={testCase} /> : null}
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
      sortedTestCases.map((testCase) => <Case key={testCase.id} testCase={testCase} />)
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

  return (<div className="section visible">
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
  </div>);
}

export default function RecordDetailStatus() {
  const loaded = useSelector((state: RootState) => state.__loaded);

  return loaded ? <RecordDetailStatusLoaded /> : null;
}
