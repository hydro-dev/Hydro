import { getAlphabeticId } from '@hydrooj/utils/lib/common';
import { ContestProblemConfig } from 'hydrooj/src/interface';
import { debounce } from 'lodash';
import React from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { api, i18n } from 'vj/utils';
import ProblemSelectAutoComplete from '../autocomplete/components/ProblemSelectAutoComplete';

interface Problem extends ContestProblemConfig {
  pid: number;
  _tmpId?: string; // use this as key
}

export interface ContestProblemEditorProps {
  pids: number[];
  problemConfig: ContestProblemConfig[];
  onChange: (pids: number[], problemConfig: Record<number, ContestProblemConfig>) => void;
}
const randomId = () => Math.random().toString(16).substring(2);
const ItemTypes = {
  PROBLEM: 'problem',
};

interface DragItem {
  index: number;
  id: string;
  type: string;
}

const DraggableRow = ({
  problem, index, handleChange, handleRemove, problemRefs, problemRawTitles, moveRow,
}) => {
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.PROBLEM,
    item: { type: ItemTypes.PROBLEM, id: problem._tmpId, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: ItemTypes.PROBLEM,
    hover: (item: DragItem, monitor) => {
      if (!monitor.isOver({ shallow: true })) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      moveRow(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  return (
    <tr ref={drop} style={{ opacity: isDragging ? 0.5 : 1 }}>
      <td className='col--drag'>
        <span ref={drag} style={{ cursor: 'move' }}>⋮</span>
      </td>
      <td className='col--pid'>
        <ProblemSelectAutoComplete
          ref={(ref) => { problemRefs.current[index] = ref; }}
          onChange={(v) => handleChange(index, 'pid', v)}
          selectedKeys={[problem.pid.toString()]}
        />
      </td>
      <td>{problemRawTitles[problem.pid]}</td>
      <td className='col--label'>
        <input
          type="text"
          className="textbox"
          value={problem.label}
          onChange={(e) => handleChange(index, 'label', e.target.value)}
        />
      </td>
      <td className='col--score'>
        <input
          type="number"
          className="textbox"
          value={problem.score || 100}
          onChange={(e) => handleChange(index, 'score', parseInt(e.target.value, 10) || 0)}
          min={0}
        />
      </td>
      <td className="col--action">
        <a className="typo-a" onClick={() => handleRemove(index)}>
          {i18n('Remove')}
        </a>
      </td>
    </tr>
  );
};

const ContestProblemEditor = ({ pids: initialPids, problemConfig: initialProblemConfig, onChange: _onChange }: ContestProblemEditorProps) => {
  // TODO: also support balloon and other fields in the future
  const [problems, setProblems] = React.useState<Problem[]>(initialPids.map((pid, idx) => {
    const cp = initialProblemConfig[pid] || {};
    return {
      pid,
      ...cp,
      ...(!cp.label ? { label: getAlphabeticId(idx) } : {}),
      _tmpId: randomId(),
    };
  }));

  const problemRefs = React.useRef<{ [key: number]: any }>({});
  const [problemRawTitles, setProblemRawTitles] = React.useState<Record<number, string>>({});

  const fetchProblemTitles = debounce(async (ids: number[]) => {
    api('problems', { ids }, ['docId', 'pid', 'title'])
      .then((res) => {
        setProblemRawTitles(res.reduce((acc, cur) => {
          acc[cur.docId] = cur.title;
          return acc;
        }, {}));
      })
      .catch(() => {
        // pid maybe not exist
      });
  }, 500);

  React.useEffect(() => {
    fetchProblemTitles(problems.map((i) => i.pid).filter((i) => i));
  }, []);

  const onChange = (newProblems: Problem[]) => {
    const fixedProblems = newProblems.map((i) => {
      const problem = { ...i };
      if (problem.score === 100) problem.score = undefined;
      return problem;
    });
    setProblems(fixedProblems);

    const pids = fixedProblems.map((i) => i.pid);
    const problemConfig = fixedProblems.reduce((acc, cur, idx) => {
      const cp = {} as ContestProblemConfig;
      if (cur.label && cur.label !== getAlphabeticId(idx)) cp.label = cur.label;
      if (cur.score && cur.score !== 100) cp.score = cur.score;
      if (Object.keys(cur).length > 0) acc[cur.pid] = cp;
      return acc;
    }, {});
    _onChange(pids, problemConfig);
  };

  const handleAdd = () => {
    const newProblems = [...problems, { pid: 0, label: getAlphabeticId(problems.length), _tmpId: randomId() }];
    setProblems(newProblems);
    onChange(newProblems);
  };

  const handleRemove = (index: number) => {
    const newProblems = problems.filter((_, i) => i !== index);
    setProblems(newProblems);
    onChange(newProblems);
  };

  const handleChange = (index: number, field: keyof Problem, value: string | number) => {
    const newProblems = [...problems];
    const problem = { ...newProblems[index] };

    switch (field) {
      case 'pid':
        problem.pid = Number(value);
        break;
      default:
        (problem as any)[field] = value;
    }

    newProblems[index] = problem;
    setProblems(newProblems);
    if (field === 'pid') {
      fetchProblemTitles(newProblems.map((i) => i.pid).filter((i) => i));
    }
    onChange(newProblems);
  };

  const moveRow = (dragIndex: number, hoverIndex: number) => {
    const newProblems = [...problems];

    const [movedItem] = newProblems.splice(dragIndex, 1);
    newProblems.splice(hoverIndex, 0, movedItem);

    setProblems(newProblems);
    onChange(newProblems);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="contest-problem-editor">
        <table className="data-table">
          <thead>
            <tr>
              <th className='col--drag'></th>
              <th className='col--pid'>pid</th>
              <th>{i18n('Title')}</th>
              <th className='col--label'>{i18n('Label')}</th>
              <th className='col--score'>{i18n('Score')}</th>
              <th className='col--action'>{i18n('Action')}</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((problem, index) => (
              <DraggableRow
                key={problem._tmpId}
                problem={problem}
                index={index}
                handleChange={handleChange}
                handleRemove={handleRemove}
                problemRefs={problemRefs}
                problemRawTitles={problemRawTitles}
                moveRow={moveRow}
              />
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: '1em' }}>
          <button type="button" className="primary button" onClick={handleAdd}>
            {i18n('Add Problem')}
          </button>
        </div>
      </div>
    </DndProvider>
  );
};

export default ContestProblemEditor;
