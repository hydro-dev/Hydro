import React from 'react';

interface SlotErrorBoundaryProps {
  slotName: string;
  label?: string;
  children: React.ReactNode;
}

interface SlotErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class SlotErrorBoundary extends React.Component<SlotErrorBoundaryProps, SlotErrorBoundaryState> {
  state: SlotErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): SlotErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const tag = this.props.label
      ? `[Hydro] SlotErrorBoundary(${this.props.slotName}/${this.props.label})`
      : `[Hydro] SlotErrorBoundary(${this.props.slotName})`;
    console.error(tag, error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    const { slotName, label } = this.props;
    return (
      <div
        style={{
          padding: '8px 12px',
          margin: '4px 0',
          border: '1px solid #e74c3c',
          borderRadius: '4px',
          backgroundColor: '#fdf0ed',
          color: '#c0392b',
          fontSize: '13px',
          fontFamily: 'monospace',
        }}
      >
        <strong>Slot Error</strong> in <code>{slotName}</code>
        {label && <> / <code>{label}</code></>}
        <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
          {this.state.error?.message}
        </pre>
      </div>
    );
  }
}
