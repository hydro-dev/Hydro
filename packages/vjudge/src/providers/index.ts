import codeforces from './codeforces';
import csgoj from './csgoj';
import hduoj from './hduoj';
import {
    HUSTOJ as hustoj,
    XJOI as xjoi,
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
    xjoi,
    hduoj,
    yacs,
};
export default vjudge;
