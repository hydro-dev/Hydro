import codeforces from './codeforces';
import csgoj from './csgoj';
import {
    BZOJ as bzoj, HUSTOJ as hustoj, XJOI as xjoi, YBT as ybt,
    YBTBAS as ybtbas,
} from './hustoj';
import luogu from './luogu';
import poj from './poj';
import spoj from './spoj';
import uoj from './uoj';

const vjudge: Record<string, any> = {
    codeforces,
    csgoj,
    'luogu.legacy': luogu,
    poj,
    spoj,
    uoj,
    hustoj,
    bzoj,
    xjoi,
    ybt,
    ybtbas,
};
export default vjudge;
