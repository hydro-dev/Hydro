import codeforces from './codeforces';
import csgoj from './csgoj';
import hduoj from './hduoj';
import {
    BZOJ as bzoj,
    HUSTOJ as hustoj,
    XJOI as xjoi,
    YBT as ybt,
    YBTBAS as ybtbas,
} from './hustoj';
import poj from './poj';
import spoj from './spoj';
import uoj from './uoj';
import yacs from './yacs';

const vjudge: Record<string, any> = {
    codeforces,
    csgoj,
    poj,
    spoj,
    uoj,
    hustoj,
    bzoj,
    xjoi,
    ybt,
    ybtbas,
    hduoj,
    yacs,
};
export default vjudge;
