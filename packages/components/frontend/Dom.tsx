import { omit } from 'lodash';
import React from 'react';

export default function DomComponent(props: React.HTMLAttributes<HTMLDivElement> & { childDom: HTMLElement }) {
  const [dom, setDom] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    if (!dom) return;
    dom.appendChild(props.childDom);
    return () => { // eslint-disable-line consistent-return
      dom.removeChild(props.childDom);
    };
  }, [dom]);
  return <div {...omit(props, 'childDom')} ref={setDom}></div>;
}
