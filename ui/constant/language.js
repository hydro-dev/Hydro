import attachObjectMeta from './util/objectMeta';

export const LANG_TEXTS = {
  c: 'C',
  cc: 'C++',
  cs: 'C#',
  pas: 'Pascal',
  java: 'Java',
  py: 'Python',
  py3: 'Python 3',
  php: 'PHP',
  rs: 'Rust',
  hs: 'Haskell',
  js: 'JavaScript',
  go: 'Go',
  rb: 'Ruby',
};

export const LANG_HIGHLIGHT_ID = {
  c: 'c',
  cc: 'cpp',
  cs: 'csharp',
  pas: 'pascal',
  java: 'java',
  py: 'python',
  py3: 'python',
  php: 'php',
  rs: 'rust',
  hs: 'haskell',
  js: 'javascript',
  go: 'go',
  rb: 'ruby',
};

export const LANG_CODEMIRROR_MODES = {
  c: 'text/x-csrc',
  cc: 'text/x-c++src',
  cs: 'text/x-csharp',
  pas: 'text/x-pascal',
  java: 'text/x-java',
  py: 'text/x-python',
  py3: 'text/x-python',
  php: 'text/x-php',
  rs: 'text/x-rustsrc',
  hs: 'text/x-haskell',
  js: 'text/javascript',
  go: 'text/x-go',
  rb: 'text/x-ruby',
};
attachObjectMeta(LANG_CODEMIRROR_MODES, 'exportToPython', false);
