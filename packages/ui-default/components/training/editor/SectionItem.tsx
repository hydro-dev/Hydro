import type { ProblemDoc } from 'hydrooj/src/interface';
import React from 'react';
import { useDrag, useDrop } from 'react-dnd';
import Notification from 'vj/components/notification';
import { i18n } from 'vj/utils';
import ProblemItem from './ProblemItem';
import ProblemSelector from './ProblemSelector';
import { DND_TYPES, TrainingNode, wouldCreateCycle } from './types';

interface SectionItemProps {
  node: TrainingNode;
  index: number;
  pdict: Record<number | string, ProblemDoc>;
  allSections: TrainingNode[];
  onUpdate: (nodeId: number, updates: Partial<TrainingNode>) => void;
  onDelete: (nodeId: number) => void;
  onMove: (dragIndex: number, hoverIndex: number) => void;
  onMoveProblem: (fromSection: number, toSection: number, fromIndex: number, toIndex: number) => void;
  onPdictUpdate: (pid: number | string, pdoc: ProblemDoc) => void;
}

interface DragItem {
  type: string;
  index: number;
  nodeId: number;
}

export default function SectionItem({
  node, index, pdict, allSections, onUpdate, onDelete, onMove, onMoveProblem, onPdictUpdate,
}: SectionItemProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [titleValue, setTitleValue] = React.useState(node.title);
  const [prereqsExpanded, setPrereqsExpanded] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const PREREQS_COLLAPSE_THRESHOLD = 8;

  const [{ isDragging }, drag, preview] = useDrag({
    type: DND_TYPES.SECTION,
    item: { type: DND_TYPES.SECTION, index, nodeId: node._id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>({
    accept: DND_TYPES.SECTION,
    hover(item) {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      onMove(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  preview(drop(ref));

  const handleTitleSave = () => {
    if (titleValue.trim()) {
      onUpdate(node._id, { title: titleValue.trim() });
    } else {
      setTitleValue(node.title);
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleTitleSave();
    if (e.key === 'Escape') {
      setTitleValue(node.title);
      setIsEditingTitle(false);
    }
  };

  const handleAddProblem = (pid: number | string, pdoc?: ProblemDoc) => {
    if (!node.pids.includes(pid)) {
      onUpdate(node._id, { pids: [...node.pids, pid] });
      if (pdoc) onPdictUpdate(pid, pdoc);
    }
  };

  const handleRemoveProblem = (pid: number | string) => {
    onUpdate(node._id, { pids: node.pids.filter((p) => p !== pid) });
  };

  const handleProblemReorder = (fromIndex: number, toIndex: number) => {
    const newPids = [...node.pids];
    const [removed] = newPids.splice(fromIndex, 1);
    newPids.splice(toIndex, 0, removed);
    onUpdate(node._id, { pids: newPids });
  };

  const handleRequireNidsChange = (sectionId: number, checked: boolean) => {
    if (checked && wouldCreateCycle(allSections, node._id, sectionId)) {
      Notification.error(i18n('Cannot add this prerequisite: it would create a circular dependency'));
      return;
    }
    const newRequireNids = checked
      ? [...node.requireNids, sectionId]
      : node.requireNids.filter((id) => id !== sectionId);
    onUpdate(node._id, { requireNids: newRequireNids });
  };

  const availablePrereqs = allSections.filter((s) => s._id !== node._id);
  const selectedPrereqs = availablePrereqs.filter((s) => node.requireNids.includes(s._id));
  const unselectedPrereqs = availablePrereqs.filter((s) => !node.requireNids.includes(s._id));
  const shouldCollapsePrereqs = availablePrereqs.length > PREREQS_COLLAPSE_THRESHOLD;
  const visiblePrereqs = shouldCollapsePrereqs && !prereqsExpanded
    ? [...selectedPrereqs, ...unselectedPrereqs.slice(0, Math.max(0, PREREQS_COLLAPSE_THRESHOLD - selectedPrereqs.length))]
    : availablePrereqs;

  const [{ isOverProblemZone }, dropProblem] = useDrop<
    { type: string, sectionId: number, index: number, pid: number | string },
    void,
    { isOverProblemZone: boolean }
  >({
    accept: DND_TYPES.PROBLEM,
    drop(item) {
      if (item.sectionId !== node._id) {
        onMoveProblem(item.sectionId, node._id, item.index, node.pids.length);
      }
    },
    collect: (monitor) => ({
      isOverProblemZone: monitor.isOver() && monitor.getItem()?.sectionId !== node._id,
    }),
  });

  return (
    <div
      ref={ref as any}
      className="training-section"
      style={{
        opacity: isDragging ? 0.5 : 1,
        border: isOver ? '2px solid #3498db' : '1px solid #ddd',
        borderRadius: '4px',
        marginBottom: '12px',
        background: '#fff',
      }}
    >
      <div
        className="training-section__header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: isCollapsed ? 'none' : '1px solid #eee',
          background: '#fafafa',
          borderRadius: isCollapsed ? '4px' : '4px 4px 0 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div ref={drag as any} style={{ cursor: 'grab', padding: '4px' }}>
            <span className="icon icon-drag_handle" style={{ opacity: 0.5 }} />
          </div>
          <span
            className="label rounded"
            style={{ background: '#3498db', color: '#fff', padding: '2px 8px', fontSize: '12px' }}
          >
            {i18n('Section')} {index + 1}
          </span>
          {isEditingTitle ? (
            <input
              type="text"
              className="textbox"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              autoFocus
              style={{ width: '300px' }}
            />
          ) : (
            <span
              style={{ fontWeight: 600, cursor: 'pointer' }}
              onClick={() => setIsEditingTitle(true)}
            >
              {node.title || i18n('Untitled Section')}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="link"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? i18n('Expand') : i18n('Collapse')}
          >
            <span className={isCollapsed ? 'icon icon-expand_more' : 'icon icon-expand_less'} />
          </button>
          <button
            type="button"
            className="link"
            onClick={() => onDelete(node._id)}
            aria-label={i18n('Delete Section')}
            style={{ color: '#e74c3c' }}
          >
            <span className="icon icon-delete" />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="training-section__body" style={{ padding: '16px' }}>
          {availablePrereqs.length > 0 && (
            <div className="training-section__prereqs" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#666' }}>
                {i18n('Prerequisite Sections')}
                {node.requireNids.length > 0 && (
                  <span style={{ marginLeft: '8px', color: '#2196f3' }}>
                    ({node.requireNids.length} {i18n('selected')})
                  </span>
                )}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {visiblePrereqs.map((s) => {
                  const isChecked = node.requireNids.includes(s._id);
                  const sectionLabel = s.title || `${i18n('Section')} ${allSections.findIndex((x) => x._id === s._id) + 1}`;
                  return (
                    <label
                      key={s._id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        background: isChecked ? '#e3f2fd' : '#f5f5f5',
                        border: isChecked ? '1px solid #2196f3' : '1px solid #ddd',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => handleRequireNidsChange(s._id, e.target.checked)}
                        style={{ margin: 0 }}
                      />
                      {sectionLabel}
                    </label>
                  );
                })}
                {shouldCollapsePrereqs && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => setPrereqsExpanded(!prereqsExpanded)}
                    style={{ fontSize: '13px', padding: '4px 8px' }}
                  >
                    {prereqsExpanded
                      ? i18n('Show less')
                      : i18n('{0} more sections', availablePrereqs.length - visiblePrereqs.length)}
                  </button>
                )}
              </div>
              <p className="help-text" style={{ margin: '8px 0 0', fontSize: '12px', color: '#999' }}>
                {i18n('Users must complete selected sections before accessing this one.')}
              </p>
            </div>
          )}
          <div
            ref={dropProblem as any}
            className="training-problems-zone"
            style={{
              background: isOverProblemZone ? '#e8f4fc' : '#f8f9fa',
              borderRadius: '4px',
              minHeight: '60px',
              border: isOverProblemZone ? '2px dashed #3498db' : '1px dashed #ddd',
              padding: '12px',
              marginBottom: '12px',
            }}
          >
            {node.pids.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999', margin: '16px 0' }}>
                {i18n('No problems in this section. Add problems below or drag from other sections.')}
              </p>
            ) : (
              <div className="training-problems-list">
                {node.pids.map((pid, pidIndex) => (
                  <ProblemItem
                    key={`${node._id}-${pid}`}
                    pid={pid}
                    pdoc={pdict[pid]}
                    index={pidIndex}
                    sectionId={node._id}
                    onRemove={() => handleRemoveProblem(pid)}
                    onReorder={handleProblemReorder}
                  />
                ))}
              </div>
            )}
          </div>

          <ProblemSelector onSelect={handleAddProblem} existingPids={node.pids} />
        </div>
      )}
    </div>
  );
}
