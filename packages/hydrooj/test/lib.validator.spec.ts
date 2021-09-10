import 'hydrooj/src/loader';

import * as validator from 'hydrooj/src/lib/validator';

describe('Validator', () => {
    test('uid', () => {
        expect(validator.isUid('123')).toBeTruthy();
        expect(validator.isUid('123')).toBeTruthy();
        expect(validator.isUid('-456')).toBeTruthy();
        expect(validator.isUid('')).toBeFalsy();
        expect(validator.isUid('1.23')).toBeFalsy();
        expect(validator.isUid('xyz')).toBeFalsy();
    });

    test('uname', () => {
        expect(validator.isUname('twd2')).toBeTruthy();
        expect(validator.isUname('123twd3')).toBeTruthy();
        expect(validator.isUname('$%1234')).toBeTruthy();
        expect(validator.isUname('12<><?,.,./,.,.;\'\'[] 3   t  ###2$%^&&*%&#^%$@#$^wd3')).toBeTruthy();
        expect(validator.isUname('中文测试')).toBeTruthy();
        expect(validator.isUname('twd'.repeat(10))).toBeTruthy();
        expect(validator.isUname('')).toBeFalsy();
        expect(validator.isUname('twd'.repeat(500))).toBeFalsy();
        expect(validator.isUname('\ntwd4')).toBeFalsy();
    });

    test('password', () => {
        expect(validator.isPassword('123twd3')).toBeTruthy();
        expect(validator.isPassword('12<><?,.,./,.,.;\'\'[]_+)}_+{}{\\%^^%$@#$^wd3')).toBeTruthy();
        expect(validator.isPassword('twd'.repeat(10))).toBeTruthy();
        expect(validator.isPassword('twd'.repeat(500))).toBeTruthy();
        expect(validator.isPassword(' twd4')).toBeTruthy();
        expect(validator.isPassword('twd2')).toBeFalsy();
        expect(validator.isPassword('')).toBeFalsy();
    });

    test('mail', () => {
        expect(validator.isEmail('ex@example.com')).toBeTruthy();
        expect(validator.isEmail('1+e-x@example.com')).toBeTruthy();
        expect(validator.isEmail('example.net@example.com')).toBeTruthy();
        expect(validator.isEmail('example:net@example.com')).toBeFalsy();
        expect(validator.isEmail('ex@examplecom')).toBeFalsy();
        expect(validator.isEmail('example.com')).toBeFalsy();
        expect(validator.isEmail('examplecom')).toBeFalsy();
        expect(validator.isEmail('1+e=x@example.com')).toBeFalsy();
    });

    /*
    test('domainId', () => {
        expect(validator.is_domain_id('my_domain_1')).toBeTruthy();
        expect(validator.is_domain_id('My_Domain')).toBeTruthy();
        expect(validator.is_domain_id('MyDomain')).toBeTruthy();
        expect(validator.is_domain_id('myDomain')).toBeTruthy();
        expect(validator.is_domain_id('twd2')).toBeTruthy();
        expect(validator.is_domain_id('twd' * 10)).toBeTruthy();
        expect(validator.is_domain_id('C:\\a.txt')).toBeFalsy();
        expect(validator.is_domain_id('/etc/hosts')).toBeFalsy();
        expect(validator.is_domain_id('')).toBeFalsy();
        expect(validator.is_domain_id(' twd4')).toBeFalsy();
        expect(validator.is_domain_id('twd4\u3000')).toBeFalsy();
        expect(validator.is_domain_id('\ntwd4')).toBeFalsy();
        expect(validator.is_domain_id('22domain')).toBeFalsy();
        expect(validator.is_domain_id('22-Domain')).toBeFalsy();
        expect(validator.is_domain_id('My-Domain')).toBeFalsy();
        expect(validator.is_domain_id('dom')).toBeFalsy();
        expect(validator.is_domain_id('twd' * 500)).toBeFalsy();
        expect(validator.is_domain_id('twd\r\n2')).toBeFalsy();
        expect(validator.is_domain_id('$domain')).toBeFalsy();
        expect(validator.is_domain_id('12<><?,.,./,.,.;\'\'[] 3   t  ###2$%^&&*%&#^')).toBeFalsy();
        expect(validator.is_domain_id('domain.id')).toBeFalsy();
    });
    */

    test('role', () => {
        expect(validator.isRole('my_domain_1')).toBeTruthy();
        expect(validator.isRole('My_Domain')).toBeTruthy();
        expect(validator.isRole('MyDomain')).toBeTruthy();
        expect(validator.isRole('myDomain')).toBeTruthy();
        expect(validator.isRole('twd2')).toBeTruthy();
        expect(validator.isRole('twd'.repeat(10))).toBeTruthy();
        expect(validator.isRole('r0le')).toBeTruthy();
        expect(validator.isRole('1role')).toBeTruthy();
        expect(validator.isRole('C:\\a.txt')).toBeFalsy();
        expect(validator.isRole('/etc/hosts')).toBeFalsy();
        expect(validator.isRole('')).toBeFalsy();
        expect(validator.isRole(' twd4')).toBeFalsy();
        expect(validator.isRole('twd4\u3000')).toBeFalsy();
        expect(validator.isRole('\ntwd4')).toBeFalsy();
        expect(validator.isRole('My-Role')).toBeFalsy();
        expect(validator.isRole('twd'.repeat(90))).toBeFalsy();
        expect(validator.isRole('twd\r\n2')).toBeFalsy();
        expect(validator.isRole('$role')).toBeFalsy();
        expect(validator.isRole('role.admin')).toBeFalsy();
        expect(validator.isRole('12<><?,.,./,.,.;\'\'[#2$%^&&*%&#^')).toBeFalsy();
    });

    test('content', () => {
        expect(validator.isContent('dummy_name')).toBeTruthy();
        expect(validator.isContent('x'.repeat(300))).toBeTruthy();
        expect(validator.isContent('c')).toBeTruthy();
        expect(validator.isContent('')).toBeFalsy();
        expect(validator.isContent('x'.repeat(700000))).toBeFalsy();
    });
});
