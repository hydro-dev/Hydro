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
