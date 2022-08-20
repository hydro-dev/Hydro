import $ from 'jquery';
import { omit } from 'lodash';
import React from 'react';

const tempDoms = {};

export default function DomComponent(props: React.HTMLAttributes<HTMLDivElement> & { id?: string, childDom: HTMLElement }) {
  const ref = React.useRef<HTMLDivElement>();
  React.useEffect(() => {
    let dom = props.childDom;
    if (props.id && dom) tempDoms[props.id] = dom;
    else if (props.id && !dom && tempDoms[props.id]) dom = tempDoms[props.id];
    ref.current.appendChild(dom);
    return () => {
      $(ref.current).empty();
    };
  });
  return <div {...omit(props, 'childDom')} ref={ref}></div>;
}
