import 'hydrooj';
import 'hydrooj/src/lib/i18n';

let lib;
try {
    lib = require('@hydrooj/geoip/lib');
} catch (e) {
    console.warn('Maxmind db load fail');
}

describe('geoip', () => {
    test('lookup', () => {
        if (lib) {
            expect(lib.lookup('127.0.0.1', 'zh_CN').display).toStrictEqual('Unknown address');
            expect(lib.lookup('1.1.1.1', 'zh-CN').display).toStrictEqual('大洋洲 澳大利亚');
            expect(lib.provider.includes('MaxMind')).toBeTruthy();
        }
    });
});
