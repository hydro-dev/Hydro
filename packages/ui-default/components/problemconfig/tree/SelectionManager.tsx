import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../reducer';
import { TestcaseGroup } from './Testcase';

interface SelectionManagerProps {
  subtaskId: number;
  subtaskIds: number[];
}

function collide(rect1: any, rect2: any): boolean {
  if ('getBoundingClientRect' in rect1) rect1 = rect1.getBoundingClientRect();
  if ('getBoundingClientRect' in rect2) rect2 = rect2.getBoundingClientRect();
  const maxX = Math.max(rect1.x + rect1.width, rect2.x + rect2.width);
  const maxY = Math.max(rect1.y + rect1.height, rect2.y + rect2.height);
  const minX = Math.min(rect1.x, rect2.x);
  const minY = Math.min(rect1.y, rect2.y);
  return maxX - minX <= rect1.width + rect2.width && maxY - minY <= rect1.height + rect2.height;
}

export function SelectionManager(props: SelectionManagerProps) {
  const { subtaskIds, subtaskId } = props;
  const cases = useSelector((state: RootState) => (subtaskId === -1
    ? state.config.__cases || []
    : state.config.subtasks.find((i) => i.id === subtaskId).cases || []));
  // Don't need to trigger a re-render for this property change
  const pos = React.useMemo(() => ({
    x: 0, y: 0, endX: 0, endY: 0,
  }), []);
  const [start, setStart] = React.useState(0);
  const [end, setEnd] = React.useState(0);
  React.useEffect(() => {
    setStart(0);
    setEnd(0);
  }, [JSON.stringify(cases)]);

  const handleMouseDown = React.useCallback((event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    pos.x = event.pageX;
    pos.y = event.pageY;
    // Check if clicking on a selected testcase
    const selected = Array.from($('[data-selected="true"]'));
    for (const el of selected) {
      if (collide(el, { ...pos, width: 1, height: 1 })) return;
    }
    // eslint-disable-next-line ts/no-use-before-define
    document.body.addEventListener('mousemove', handleMouseMove);
    // eslint-disable-next-line ts/no-use-before-define
    document.body.addEventListener('mouseup', handleMouseUp);
    $('body').css('cursor', 'crosshair')
      .append('<div id="divSelectArea" style="position:absolute;background-color:#e073d4;"></div>');
    $('#divSelectArea').css({
      top: event.pageY,
      left: event.pageX,
      zIndex: 9999999,
    }).fadeTo(12, 0.2);
  }, [JSON.stringify(cases)]);
  const handleMouseMove = React.useCallback((event) => {
    pos.endX = event.pageX;
    pos.endY = event.pageY;
    $('#divSelectArea').css({
      top: Math.min(event.pageY, pos.y),
      left: Math.min(event.pageX, pos.x),
      height: Math.abs(event.pageY - pos.y),
      width: Math.abs(event.pageX - pos.x),
    });
  }, [JSON.stringify(cases)]);
  const handleMouseUp = React.useCallback(() => {
    document.body.removeEventListener('mousemove', handleMouseMove);
    document.body.removeEventListener('mouseup', handleMouseUp);
    const caseEntries = Array.from($(`[data-subtaskid="${subtaskId}"]`));
    const selected = [];
    for (let i = 0; i < caseEntries.length; i += 1) {
      if (collide(caseEntries[i], $('#divSelectArea')[0])) {
        selected.push(cases.indexOf(cases.find((c) => c.input === caseEntries[i].dataset.index)));
      }
    }
    const sorted = selected.sort((a, b) => a - b);
    $('#divSelectArea').remove();
    $('body').css('cursor', 'default');
    pos.x = pos.y = pos.endX = pos.endY = 0;
    if (!sorted.length) return;
    setStart(sorted[0]);
    setEnd(sorted[selected.length - 1] + 1);
  }, [JSON.stringify(cases)]);

  return (
    <>
      {end > start && cases.slice(0, start).map((c, id) => (
        <TestcaseGroup
          subtaskId={subtaskId}
          cases={[c]}
          key={`${c.input}@${id}`}
          selected={false}
          subtaskIds={subtaskIds}
          index={id}
          onMouseDown={handleMouseDown}
          onClick={() => {
            setStart(id);
            setEnd(id + 1);
          }}
        />
      ))}
      {start <= end && (
        <TestcaseGroup
          cases={cases.slice(start, end)}
          subtaskId={subtaskId}
          subtaskIds={subtaskIds}
          onMouseDown={handleMouseDown}
          selected={true}
          index={start}
        />
      )}
      {end < cases.length && cases.slice(end).map((c, id) => (
        <TestcaseGroup
          subtaskId={subtaskId}
          cases={[c]}
          key={`${c.input}@${id}`}
          subtaskIds={subtaskIds}
          selected={false}
          onMouseDown={handleMouseDown}
          index={id + end}
          onClick={() => {
            setStart(id + end);
            setEnd(id + end + 1);
          }}
        />
      ))}
    </>
  );
}
