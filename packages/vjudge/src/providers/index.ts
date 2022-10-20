import codeforces from './codeforces';
import csgoj from './csgoj';
import luogu from './luogu';
import poj from './poj';
import spoj from './spoj';
import uoj from './uoj';

const vjudge: Record<string, any> = {
    codeforces, csgoj, luogu, poj, spoj, uoj,
};
export default vjudge;
