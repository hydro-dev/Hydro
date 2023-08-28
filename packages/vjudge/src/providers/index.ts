import codeforces from './codeforces';
import csgoj from './csgoj';
import hduoj from './hduoj';
import {
    BZOJ as bzoj, HUSTOJ as hustoj, XJOI as xjoi, YBT as ybt,
    YBTBAS as ybtbas,
} from './hustoj';
import luogu from './luogu';
import poj from './poj';
import spoj from './spoj';
import uoj from './uoj';

const vjudge: Record<string, any> = {
    bzoj,
    codeforces,
    csgoj,
    hduoj,
    hustoj,
    'luogu.legacy': luogu,
    poj,
    spoj,
    uoj,
    xjoi,
    ybt,
    ybtbas,
};
export default vjudge;
