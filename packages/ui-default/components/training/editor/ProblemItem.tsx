import type { ProblemDoc } from 'hydrooj/src/interface';
import React from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { i18n } from 'vj/utils';
import { DND_TYPES } from './types';

interface ProblemItemProps {
  pid: number | string;
  pdoc?: ProblemDoc;
  index: number;
  sectionId: number;
  onRemove: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

interface DragItem {
  type: string;
  sectionId: number;
  index: number;
  pid: number | string;
}

export default function ProblemItem({
  pid, pdoc, index, sectionId, onRemove, onReorder,
}: ProblemItemProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: DND_TYPES.PROBLEM,
    item: { type: DND_TYPES.PROBLEM, sectionId, index, pid },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>({
    accept: DND_TYPES.PROBLEM,
    hover(item) {
      if (!ref.current) return;
      if (item.sectionId !== sectionId) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      onReorder(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver() && monitor.getItem()?.sectionId === sectionId,
    }),
  });

  drag(drop(ref));

  const displayTitle = pdoc
    ? `${pdoc.pid ? `${pdoc.pid} ` : ''}${pdoc.title}`
    : `${i18n('Problem')} ${pid}`;

  const displayId = pdoc?.docId || pid;

  return (
    <div
      ref={ref as any}
      className="training-problem-item"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        background: isOver ? '#e8f4fc' : '#fff',
        borderRadius: '4px',
        border: '1px solid #ddd',
        marginBottom: '6px',
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="icon icon-drag_handle" style={{ opacity: 0.5 }} />
        <span style={{ fontWeight: 500 }}>{displayTitle}</span>
        <span style={{ color: '#999', fontSize: '12px' }}>(ID: {displayId})</span>
      </div>
      <button
        type="button"
        className="link"
        onClick={onRemove}
        aria-label={i18n('Remove Problem')}
        style={{ color: '#e74c3c' }}
      >
        <span className="icon icon-close" />
      </button>
    </div>
  );
}
