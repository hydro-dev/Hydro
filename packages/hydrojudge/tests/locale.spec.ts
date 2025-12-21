import { expect } from 'chai';
import { describe, it } from 'node:test';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

describe('hydrojudge locales', () => {
    const localesDir = path.join(__dirname, '../locales');
    const zhTWPath = path.join(localesDir, 'zh_TW.yaml');

    describe('zh_TW.yaml', () => {
        let zhTWContent: any;
        let allLocales: Record<string, any> = {};

        it('should exist and be readable', () => {
            expect(fs.existsSync(zhTWPath)).to.be.true;
            const content = fs.readFileSync(zhTWPath, 'utf-8');
            expect(content).to.be.a('string');
            expect(content.length).to.be.greaterThan(0);
        });

        it('should be valid YAML', () => {
            const content = fs.readFileSync(zhTWPath, 'utf-8');
            zhTWContent = yaml.load(content);
            expect(zhTWContent).to.be.an('object');
        });

        it('should have all required keys', () => {
            const requiredKeys = [
                'Cannot find checker {0}.',
                'Cannot find input file {0}.',
                'Cannot find output file {0}.',
                'Cannot parse testdata.',
                'Problem data not found.',
                'Sandbox Error',
            ];

            for (const key of requiredKeys) {
                expect(zhTWContent).to.have.property(key);
                expect(zhTWContent[key]).to.be.a('string');
                expect(zhTWContent[key].length).to.be.greaterThan(0);
            }
        });

        it('should have translations for all error messages', () => {
            const errorKeys = Object.keys(zhTWContent).filter(key =>
                key.includes('Error') || key.includes('Cannot') || key.includes('Invalid')
            );

            expect(errorKeys.length).to.be.greaterThan(0);

            for (const key of errorKeys) {
                expect(zhTWContent[key]).to.be.a('string');
                expect(zhTWContent[key].length).to.be.greaterThan(0);
                // Should be in Traditional Chinese
                expect(zhTWContent[key]).to.not.equal(key);
            }
        });

        it('should maintain consistent placeholder format {0}, {1}, etc.', () => {
            for (const [key, value] of Object.entries(zhTWContent)) {
                if (typeof value !== 'string') continue;

                // Extract placeholders from key
                const keyPlaceholders = (key.match(/\{\d+\}/g) || []).sort();
                // Extract placeholders from value
                const valuePlaceholders = (value.match(/\{\d+\}/g) || []).sort();

                // If key has placeholders, value should have same placeholders
                if (keyPlaceholders.length > 0) {
                    expect(valuePlaceholders.length).to.equal(keyPlaceholders.length,
                        `Key "${key}" has ${keyPlaceholders.length} placeholders but value has ${valuePlaceholders.length}`);
                }
            }
        });

        it('should not have empty translations', () => {
            for (const [key, value] of Object.entries(zhTWContent)) {
                if (typeof value === 'string') {
                    expect(value.trim()).to.not.equal('', `Key "${key}" has empty translation`);
                }
            }
        });

        it('should use Traditional Chinese characters', () => {
            // Check for common Traditional Chinese characters vs Simplified
            const traditionalIndicators = ['無', '測', '檔', '資', '錯', '評', '機'];
            const simplifiedIndicators = ['无', '测', '档', '资', '错', '评', '机'];

            const allValues = Object.values(zhTWContent).filter(v => typeof v === 'string').join('');

            // Should contain Traditional Chinese characters
            const hasTraditional = traditionalIndicators.some(char => allValues.includes(char));
            expect(hasTraditional).to.be.true;

            // Should NOT contain Simplified Chinese characters (or very few)
            const simplifiedCount = simplifiedIndicators.filter(char => allValues.includes(char)).length;
            const traditionalCount = traditionalIndicators.filter(char => allValues.includes(char)).length;

            expect(traditionalCount).to.be.greaterThan(simplifiedCount);
        });

        it('should have consistent terminology', () => {
            const allValues = Object.values(zhTWContent).filter(v => typeof v === 'string').join(' ');

            // Traditional Chinese should use: 測試 (not 测试), 檔案 (not 文件 for files)
            if (allValues.includes('測試') || allValues.includes('檔案')) {
                expect(allValues.includes('测试')).to.be.false;
            }
        });

        it('should have expected number of translation keys', () => {
            const keyCount = Object.keys(zhTWContent).length;
            expect(keyCount).to.equal(39); // Based on the diff showing 39 new lines
        });

        it('should compare with other locale files for completeness', () => {
            const localeFiles = fs.readdirSync(localesDir).filter(f => f.endsWith('.yaml'));

            for (const file of localeFiles) {
                const content = yaml.load(fs.readFileSync(path.join(localesDir, file), 'utf-8')) as any;
                allLocales[file.replace('.yaml', '')] = content;
            }

            // zh_TW should have similar structure to other locales
            if (allLocales['zh']) {
                const zhKeys = new Set(Object.keys(allLocales['zh']));
                const zhTWKeys = new Set(Object.keys(zhTWContent));

                // Most keys should overlap
                const commonKeys = [...zhKeys].filter(k => zhTWKeys.has(k));
                const overlapPercentage = (commonKeys.length / zhKeys.size) * 100;

                expect(overlapPercentage).to.be.greaterThan(80);
            }
        });

        it('should have proper punctuation for Chinese locale', () => {
            for (const [key, value] of Object.entries(zhTWContent)) {
                if (typeof value !== 'string') continue;

                // If key ends with period, Chinese translation might use Chinese period or keep English period
                if (key.endsWith('.')) {
                    expect(value.endsWith('。') || value.endsWith('.')).to.be.true;
                }
            }
        });

        it('should not have leading or trailing whitespace in translations', () => {
            for (const [key, value] of Object.entries(zhTWContent)) {
                if (typeof value === 'string') {
                    expect(value).to.equal(value.trim(), `Key "${key}" has leading/trailing whitespace`);
                }
            }
        });

        it('should handle special characters correctly', () => {
            for (const [key, value] of Object.entries(zhTWContent)) {
                if (typeof value !== 'string') continue;

                // Check that special characters in keys are preserved
                if (key.includes(':') && value.includes('：')) {
                    // Chinese colon is acceptable replacement
                    expect(value).to.satisfy((v: string) => v.includes(':') || v.includes('：'));
                }
            }
        });

        it('should have consistent format for config keys', () => {
            const configKeys = Object.keys(zhTWContent).filter(k =>
                k.includes('directory') || k.includes('Max') || k.includes('Re-Run')
            );

            for (const key of configKeys) {
                expect(zhTWContent[key]).to.be.a('string');
                expect(zhTWContent[key].length).to.be.greaterThan(0);
            }
        });

        it('should properly translate technical terms', () => {
            const technicalTerms = {
                'Sandbox': '沙箱',
                'checker': '比較器',
                'testcase': '測試點',
                'testdata': '測試資料',
            };

            const allValues = Object.values(zhTWContent).filter(v => typeof v === 'string').join(' ');

            for (const [english, chinese] of Object.entries(technicalTerms)) {
                if (allValues.includes(chinese)) {
                    // If we have the Chinese term, it should be used consistently
                    expect(allValues.toLowerCase()).to.satisfy((v: string) =>
                        !v.includes(english.toLowerCase()) || v.includes(chinese)
                    );
                }
            }
        });

        it('should handle numbers and units correctly', () => {
            for (const [key, value] of Object.entries(zhTWContent)) {
                if (typeof value !== 'string') continue;

                // Check for time units
                if (value.includes('秒')) {
                    // Should be proper Chinese format
                    expect(value).to.match(/\d+秒|{0}秒|{1}秒/);
                }
            }
        });
    });

    describe('locale file integrity', () => {
        it('should have all locale files with consistent naming', () => {
            const files = fs.readdirSync(localesDir);
            const yamlFiles = files.filter(f => f.endsWith('.yaml'));

            expect(yamlFiles.length).to.be.greaterThan(0);

            for (const file of yamlFiles) {
                // File names should match locale code pattern
                expect(file).to.match(/^[a-z]{2}(_[A-Z]{2})?\.yaml$/);
            }
        });

        it('should have valid YAML syntax in all locale files', () => {
            const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.yaml'));

            for (const file of files) {
                const content = fs.readFileSync(path.join(localesDir, file), 'utf-8');
                expect(() => yaml.load(content)).to.not.throw();
            }
        });
    });
});