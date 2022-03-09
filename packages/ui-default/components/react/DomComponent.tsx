import React from 'react';
import { omit } from 'lodash';

export default function DomComponent(props: React.HTMLAttributes<HTMLDivElement> & { childDom: HTMLElement }) {
  const ref = React.useRef<HTMLDivElement>();
  React.useEffect(() => {
    ref.current.appendChild(props.childDom);
    return () => {
      $(ref.current).empty();
    };
  });
  return <div {...omit(props, 'childDom')} ref={ref}></div>;
}
