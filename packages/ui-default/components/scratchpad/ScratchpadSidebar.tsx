import React from 'react';

export default function ScratchpadSidebar({ name }) {
  const Component = window.Hydro.scratchpad?.[name];
  const [state, setState] = React.useState(0);
  if (Component) return <Component />;
  setTimeout(() => setState(state + 1), 1000);
  return <div>No registered providers.</div>;
}
