import { lookup } from 'mime-types';

export default function mime(file: string) {
    const identifer = file.toLowerCase();
    return (['.in', '.out', '.ans'].some((i) => identifer.endsWith(i)))
        ? 'text/plain'
        : lookup(file) || 'application/octet-stream';
}
