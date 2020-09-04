import 'hydrooj';
import { convertHTML } from '@hydrooj/html2md/lib';

describe('html2md', () => {
    test('convertHTML', () => {
        expect(convertHTML('<h1>Test</h1><p>test</p>')).toStrictEqual('# Test\n\ntest');
    });
});
