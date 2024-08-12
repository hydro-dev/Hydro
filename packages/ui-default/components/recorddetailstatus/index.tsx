import { size } from '@hydrooj/utils/lib/common';
import { getScoreColor, STATUS, STATUS_TEXTS } from '@hydrooj/utils/lib/status';
import { AnsiUp } from 'ansi_up';
import {
  Fragment, SubtaskResult, TestCase,
} from 'hydrooj';
import _ from 'lodash';
import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { useSelector } from 'react-redux';
import { STATUS_CODES } from 'vj/constant/record';
import { i18n, request } from 'vj/utils';
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

function StreamFilePreview({
  fragment, streamName,
}: {
  fragment: Fragment,
  streamName: string,
}) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elRef.current) return;

    const $dom = $(elRef.current);
    prism.highlightBlocks($dom);
  }, [fragment, elRef]);

  const omitBytesLeft = fragment.pos.begin.byte;
  const omitBytesRight = fragment.length - fragment.pos.end.byte;

  return (<div>
    <h3 className="section__title">
      {i18n(`Stream ${streamName}`)}
    </h3>
    <div className="fragment-wrap" ref={elRef}>
      <pre
        className="line-numbers"
        data-start={fragment.pos.begin.line + 1}
        data-line={fragment.highlightLines.map((line) => line.toString()).join(',')}
        data-line-offset={fragment.pos.begin.line}
        data-toolbar-order=""
      >
        {omitBytesLeft ? <><div>{i18n('{0} bytes omitted').format(omitBytesLeft)}</div><hr /></> : null}
        <code>{fragment.content}</code>
        {omitBytesRight ? <><hr /><div>{i18n('{0} bytes omitted').format(omitBytesRight)}</div></> : null}
      </pre>
    </div>
  </div>);
}

function CaseDetailsView({ testCase }: { testCase: TestCase }) {
  return (
    <div className='details'>
      {testCase.message ? <div>
        <h3 className="section__title">
          {i18n('Checker Message')}
        </h3>
        <div>
          <pre dangerouslySetInnerHTML={{ __html: ansiToHtml(testCase.message) }}></pre>
        </div>
      </div> : null}
      {
        Object.entries(testCase.fragments || {}).map(([streamName, fragment]) => (
          <StreamFilePreview
            key={streamName}
            streamName={streamName}
            fragment={fragment} />))
      }
    </div>
  );
}

function CaseDetails({ subtaskId, caseId }: { subtaskId: number, caseId: number }) {
  const [testCase, setTestCase] = useState(null as TestCase | null);

  useEffect(() => {
    request.get(`${window.location.pathname}?subtaskId=${subtaskId}&caseId=${caseId}`).then((data) => {
      if (!data.testCase) {
        return;
      }
      setTestCase(data.testCase);
    }).catch((err) => {
      console.debug('error!', err);
    });
  }, [subtaskId, caseId]);

  return (<>
    {testCase ? <CaseDetailsView testCase={testCase} /> : i18n('Fetching testcase data...')}
  </>);
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
      <div className="case-line" onClick={handleClick} title={testCase.message}>
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
          {testCase.scaledScore !== undefined ? `${(testCase.scaledScore * 100).toFixed(0)}%` : testCase.score.toFixed(3)} pt
        </div>
        <div className="cell">
          {statusIsLimitExceeded ? '>' : ''}{testCase.time.toFixed(0)} ms
        </div>
        <div className="cell">
          {statusIsLimitExceeded ? '>' : ''}{size(testCase.memory, 1024)}
        </div>
      </div>
      {expanded ? <CaseDetails subtaskId={testCase.subtaskId} caseId={testCase.id} /> : null}
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
        {progress ? `${progress.toFixed(0)}%` : null}
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
