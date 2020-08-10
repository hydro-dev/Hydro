import 'hydrooj';
import pwhash from 'hydrooj/src/lib/hash.hydro';
import 'hydrooj/src/utils';

describe('Hash', () => {
    test('server', () => {
        const password1 = 'password1';
        const salt1 = '0326Bc23E6fac733K01g29fBBUSAj7O4';
        const salt2 = String.random(32);
        const hash1 = '70a2db6a53ecd75d8d4b19d8647a416b4e812c1a6635c4a1f5069a00382fdcb6';
        expect(pwhash(password1, salt1)).toStrictEqual(hash1);
        expect(pwhash(password1, salt2)).not.toEqual(hash1);
    });
});
