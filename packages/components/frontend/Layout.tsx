import React from 'react';

export function Row({ children }: { children: React.ReactNode }) {
  return <div className="row">
    {children}
  </div>;
}

export function Column({ children, md }: { children: React.ReactNode, md?: number }) {
  return <div className={`columns medium-${md || 12}`}>
    {children}
  </div>;
}
