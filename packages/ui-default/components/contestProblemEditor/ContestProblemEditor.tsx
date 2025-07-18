import { getAlphabeticId } from '@hydrooj/utils/lib/common';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { debounce } from 'lodash';
import React from 'react';
import { api, i18n } from 'vj/utils';
import ProblemSelectAutoComplete from '../autocomplete/components/ProblemSelectAutoComplete';

export interface Problem {
  pid: number;
  label?: string;
  title?: string;
  score?: number;
  balloon?: {
    color: string;
    name: string;
  };
  _tmpId?: string; // use this as key
}

export interface ContestProblemEditorProps {
  problems: Problem[];
  onChange: (problems: Problem[]) => void;
}
const randomId = () => Math.random().toString(16).substring(2);
const ContestProblemEditor = ({ problems: initialProblems, onChange: _onChange } : ContestProblemEditorProps) => {
  // TODO: also support balloon and other fields in the future
  const [problems, setProblems] = React.useState<Problem[]>(initialProblems.map((el, idx) => ({
    ...el,
    _tmpId: randomId(),
    ...(!el.label ? { label: getAlphabeticId(idx) } : {}),
  })));

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
      // undefined is ok, JSON.stringify will ignore it
      if (problem.title === '') problem.title = undefined;
      if (problem.score === 100) problem.score = undefined;
      return problem;
    });
    setProblems(fixedProblems);
    _onChange(fixedProblems.map((i, idx) => {
      const { _tmpId, label, ...p } = i;
      return {
        ...p,
        ...(label !== getAlphabeticId(idx) ? { label } : {}),
      };
    }));
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

  const onDragEnd = (result) => {
    if (!result.destination) return;

    const newProblems = [...problems];
    const [iX, iY] = [result.source.index, result.destination.index];
    [newProblems[iX], newProblems[iY]] = [newProblems[iY], newProblems[iX]];
    const [labelX, labelY] = [newProblems[iX].label, newProblems[iY].label];
    newProblems[iX].label = labelY;
    newProblems[iY].label = labelX;

    setProblems(newProblems);
    onChange(newProblems);
  };

  return (
    <div className="contest-problem-editor">
      <DragDropContext onDragEnd={onDragEnd}>
        <table className="data-table">
          <thead>
            <tr>
              <th className='col--drag'></th>
              <th className='col--pid'>pid</th>
              <th>{i18n('Raw Title')}</th>
              <th>{i18n('Custom Title')}</th>
              <th className='col--label'>{i18n('Label')}</th>
              <th className='col--score'>{i18n('Score')}</th>
              <th className='col--action'>{i18n('Action')}</th>
            </tr>
          </thead>
          <Droppable droppableId="droppable-problems">
            {(provided) => (
              <tbody {...provided.droppableProps} ref={provided.innerRef}>
                {problems.map((problem, index) => (
                  <Draggable
                    key={problem._tmpId}
                    draggableId={`problem-${problem._tmpId}`}
                    index={index}
                  >
                    {(providedDrag, snapshot) => (
                      <tr
                        ref={providedDrag.innerRef}
                        {...providedDrag.draggableProps}
                        className={snapshot.isDragging ? 'dragging' : ''}
                      >
                        <td {...providedDrag.dragHandleProps} className='col--drag' style={{ cursor: 'move' }}>
                          ⋮
                        </td>
                        <td className='col--pid'>
                          <ProblemSelectAutoComplete
                            ref={(ref) => { problemRefs.current[index] = ref; }}
                            onChange={(v) => handleChange(index, 'pid', v)}
                            selectedKeys={[problem.pid.toString()]}
                          />
                        </td>
                        <td>
                          {problemRawTitles[problem.pid]}
                        </td>
                        <td>
                          <input
                            type="text"
                            className="textbox"
                            value={problem.title || ''}
                            onChange={(e) => handleChange(index, 'title', e.target.value)}
                            placeholder={i18n('(leave blank if none)')}
                          />
                        </td>
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
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </tbody>
            )}
          </Droppable>
        </table>
      </DragDropContext>
      <div style={{ marginTop: '1em' }}>

        <button type="button" className="primary button" onClick={handleAdd}>
          {i18n('Add Problem')}
        </button>
      </div>
    </div>
  );
};

export default ContestProblemEditor;
