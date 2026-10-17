declare module '*.svg?react' {
  import { ComponentType } from 'react';
  const content: ComponentType;
  export default content;
}
declare module '*.vue' {
  export default {} as any;
}
declare module '*.css' {
  const content: string;
  export default content;
}
declare module '*.styl' {
  const content: string;
  export default content;
}
declare module '*.scss' {
  const content: string;
  export default content;
}

// monaco internal modules blocked by package exports; types declared here, runtime is aliased in webpack config
declare module 'monaco-editor/esm/vs/editor/browser/editorExtensions' {
  export class EditorAction {
    constructor(opts: { id: string; label: string; alias: string });
    run(accessor: any, editor: any): Promise<any>;
  }
  export function registerEditorAction(ctor: any): void;
}
declare module 'monaco-editor/esm/vs/platform/quickinput/common/quickInput' {
  // monaco DI token（createDecorator 返回值），运行时按值使用
  export const IQuickInputService: any;
}
declare module 'monaco-editor/esm/vs/base/browser/markdownRenderer' {
  export function renderMarkdown(opts: any): any;
}
