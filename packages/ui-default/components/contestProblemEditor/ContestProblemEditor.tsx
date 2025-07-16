import { getAlphabeticId } from '@hydrooj/utils/lib/common';
import React from 'react';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { api, i18n } from 'vj/utils';
import ProblemSelectAutoComplete from '../autocomplete/components/ProblemSelectAutoComplete';

export interface Problem {
  pid: number;
  label: string;
  title?: string;
  score?: number;
  balloon?: {
    color: string;
    name: string;
  };
  _tmpId?: string; // use this as key for better rander
}

export interface ContestProblemEditorProps {
  problems: Problem[];
  onChange: (problems: Problem[]) => void;
}
const randomId = () => Math.random().toString(16).substring(2);
const ContestProblemEditor: React.FC<ContestProblemEditorProps> = ({ problems: initialProblems, onChange }) => {
  // TODO: also support balloon and other fields in the future
  const [problems, setProblems] = React.useState<Problem[]>(initialProblems.map((el) => ({ ...el, _tmpId: randomId() })));

  console.log(problems);
  const problemRefs = React.useRef<{ [key: number]: any }>({});
  const [problemRawTitles, setProblemRawTitles] = React.useState<Record<number, string>>({});

  const fetchProblemTitles = async (ids: number[]) => {
    api('problems', { ids }, ['docId', 'pid', 'title'])
      .then((res) => {
        setProblemRawTitles(res.reduce((acc, cur) => ({ ...acc, [cur.docId]: cur.title }), {}));
      })
      .catch(() => {
        // pid maybe not exist
      });
  };

  React.useEffect(() => {
    fetchProblemTitles(problems.map((i) => i.pid).filter((i) => i));
  }, []);

  const beforeOnChange = (newProblems: Problem[]) => {
    const fixedProblems = newProblems.map((i) => {
      const problem = { ...i };
      if (problem.title === '') delete problem.title;
      if (problem.score === 100) delete problem.score;
      return problem;
    });
    setProblems(fixedProblems);
    onChange(fixedProblems.map((i) => {
      const p = { ...i };
      delete p._tmpId;
      return p;
    }));
  };

  const handleAdd = () => {
    const newProblems = [...problems, { pid: 0, label: getAlphabeticId(problems.length), _tmpId: randomId() }];
    setProblems(newProblems);
    beforeOnChange(newProblems);
  };

  const handleRemove = (index: number) => {
    const newProblems = problems.filter((_, i) => i !== index);
    setProblems(newProblems);
    beforeOnChange(newProblems);
  };

  const handleChange = (index: number, field: keyof Problem, value: string | number) => {
    const newProblems = [...problems];
    const problem = { ...newProblems[index] };

    switch (field) {
      case 'pid':
        problem.pid = Number(value);
        break;
      default:
        problem[field] = value;
    }

    newProblems[index] = problem;
    setProblems(newProblems);
    if (field === 'pid') {
      fetchProblemTitles(newProblems.map((i) => i.pid).filter((i) => i));
    }
    beforeOnChange(newProblems);
  };

  const onDragEnd = (result) => {
    console.log(result);
    if (!result.destination) return;

    const newProblems = Array.from(problems);
    // exchange label
    [
      newProblems[result.source.index], newProblems[result.destination.index],
    ] = [
      newProblems[result.destination.index], newProblems[result.source.index],
    ];
    const [labelX, labelY] = [newProblems[result.source.index].label, newProblems[result.destination.index].label];
    newProblems[result.source.index].label = labelY;
    newProblems[result.destination.index].label = labelX;

    setProblems(newProblems);
    beforeOnChange(newProblems);
  };

  return (
    <div className="contest-problem-editor">
      <DragDropContext onDragEnd={onDragEnd}>
        <table className="data-table">
          <thead>
            <tr>
              <th className='col--drag'></th>
              <th className='col--pid'>Pid</th>
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
                            placeholder={i18n('Empty will use raw title')}
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
