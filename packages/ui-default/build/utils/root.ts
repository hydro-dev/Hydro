import path from 'path';

export default function root(fn = '.') {
  return path.resolve(__dirname, '../../', fn);
}
