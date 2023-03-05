import { Icon } from '@blueprintjs/core';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from './reducer';

export function ProblemConfigTree() {
  const testdata = useSelector((s: RootState) => s.testdata);
  const config = useSelector((s: RootState) => s.config);
  const dispatch = useDispatch();
  const subtasks = config.subtasks || [];
  console.log(testdata, config);
  return (
    <div className="bp4-tree">
      <ul className="bp4-tree-node-list bp4-tree-root">
        {subtasks.map((subtask) => (
          <li className="bp4-tree-node bp4-tree-node-expanded">
            <div className="bp4-tree-node-content">
              <span className="icon icon-expand_more"></span>
              <span className="bp4-tree-node-label">Subtask {subtask.id}</span>
              <span className="bp4-tree-node-secondary-label">
                <Icon icon="trash"></Icon>
              </span>
            </div>
            <ul className="bp4-tree-node-list">
              <li className="bp4-tree-node">
                <div className="bp4-tree-node-content">
                  <span className="bp4-tree-node-caret-none bp4-icon-standard"></span>
                  <Icon icon="time" />
                  &nbsp;&nbsp;
                  <span className="bp4-tree-node-label">{config.time || subtask.time}</span>
                  <Icon icon="comparison" />
                  &nbsp;&nbsp;
                  <span className="bp4-tree-node-label">{config.memory || subtask.memory}</span>
                  <Icon icon="star" />
                  {' '}
                  <span className="bp4-tree-node-secondary-label">{subtask.score || 0}</span>
                </div>
              </li>
              {subtask.cases.map((c) => (
                <li className="bp4-tree-node" key={c.input}>
                  <div className="bp4-tree-node-content">
                    <span className="bp4-tree-node-caret-none bp4-icon-standard"></span>
                    <span className="bp4-tree-node-label">{c.input} / {c.output}</span>
                  </div>
                </li>
              ))}
              {!subtask.cases?.length && (
                <li className="bp4-tree-node">
                  <div className="bp4-tree-node-content">
                    <span className="bp4-tree-node-caret-none bp4-icon-standard"></span>
                    <span className="bp4-tree-node-label">Drag and drop testcases here:</span>
                  </div>
                </li>
              )}
            </ul>
          </li>
        ))}
        <li
          className="bp4-tree-node bp4-tree-node-expanded"
          onClick={() => dispatch({ type: 'CONFIG_SUBTASK_UPDATE', id: 0, key: 'add' })}
        >
          <div className="bp4-tree-node-content">
            <span className="icon icon-add"></span>
            <span className="bp4-tree-node-label">Add New Subtask</span>
          </div>
        </li>
      </ul>
    </div>
  );
}
