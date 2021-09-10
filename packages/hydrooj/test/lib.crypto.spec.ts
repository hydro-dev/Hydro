import 'hydrooj/src/loader';

import { md5, sha1 } from 'hydrooj/src/lib/crypto';
import pwhash from 'hydrooj/src/lib/hash.hydro';

describe('crypto', () => {
    const content1 = 'twd2akioi';
    const content2 = '陈志鹏爱吃玻璃。';

    test('MD5', () => {
        const result1 = '57b6a9bd92c0502714ecedc4a5ebf24c';
        const result2 = 'f598cb0738e7cd9efbbdf0ad7b6b42a7';
        expect(md5(content1)).toStrictEqual(result1);
        expect(md5(content2)).toStrictEqual(result2);
    });

    test('SHA1', () => {
        const result1 = 'bade50df188c338fae183cf3bde34fafaf590bc5';
        const result2 = '4d3fce39e3a163fe65263d8283ed3e98244fda42';
        expect(sha1(content1)).toStrictEqual(result1);
        expect(sha1(content2)).toStrictEqual(result2);
    });

    test('PWHASH', () => {
        const password1 = 'password1';
        const salt1 = '0326Bc23E6fac733K01g29fBBUSAj7O4';
        const salt2 = String.random(32);
        const hash1 = '70a2db6a53ecd75d8d4b19d8647a416b4e812c1a6635c4a1f5069a00382fdcb6';
        expect(pwhash(password1, salt1)).toStrictEqual(hash1);
        expect(pwhash(password1, salt2)).not.toEqual(hash1);
    });
});
