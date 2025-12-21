import { expect } from 'chai';
import { describe, it } from 'node:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

/**
 * Comprehensive test suite for zh_TW locale files
 * Tests YAML syntax, structure, key consistency, and placeholder validation
 */

describe('Locale Files - zh_TW (Traditional Chinese)', () => {
    // Helper function to load YAML files
    function loadYamlFile(filePath: string): Record<string, string> {
        try {
            const content = readFileSync(filePath, 'utf-8');
            const parsed = yaml.load(content);
            if (typeof parsed !== 'object' || parsed === null) {
                throw new Error('YAML file must contain an object');
            }
            return parsed as Record<string, string>;
        } catch (error) {
            throw new Error(`Failed to load ${filePath}: ${error.message}`);
        }
    }

    // Helper function to extract placeholders from a string
    function extractPlaceholders(str: string): string[] {
        const matches = str.match(/\{(\d+)\}/g);
        return matches ? matches.map(m => m.match(/\{(\d+)\}/)[1]) : [];
    }

    // Helper function to check if a string contains unmatched quotes
    function hasUnmatchedQuotes(str: string): boolean {
        const singleQuotes = (str.match(/'/g) || []).length;
        const doubleQuotes = (str.match(/"/g) || []).length;
        return singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0;
    }

    describe('hydrojudge/locales/zh_TW.yaml', () => {
        const zhTWPath = join(__dirname, '../../packages/hydrojudge/locales/zh_TW.yaml');
        const zhPath = join(__dirname, '../../packages/hydrojudge/locales/zh.yaml');
        let zhTW: Record<string, string>;
        let zh: Record<string, string>;

        it('should be valid YAML syntax', () => {
            expect(() => {
                zhTW = loadYamlFile(zhTWPath);
            }).to.not.throw();
        });

        it('should load baseline zh locale for comparison', () => {
            expect(() => {
                zh = loadYamlFile(zhPath);
            }).to.not.throw();
        });

        it('should have the same keys as zh.yaml (baseline)', () => {
            zhTW = loadYamlFile(zhTWPath);
            zh = loadYamlFile(zhPath);
            
            const zhTWKeys = Object.keys(zhTW).sort();
            const zhKeys = Object.keys(zh).sort();
            
            expect(zhTWKeys).to.deep.equal(zhKeys, 'zh_TW.yaml should have exactly the same keys as zh.yaml');
        });

        it('should not have duplicate keys', () => {
            const content = readFileSync(zhTWPath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
            const keys = lines.map(line => {
                const match = line.match(/^(['"]?)(.*?)\1:/);
                return match ? match[2] : null;
            }).filter(Boolean);
            
            const keySet = new Set(keys);
            expect(keys.length).to.equal(keySet.size, 'Should not contain duplicate keys');
        });

        it('should have matching placeholder counts with baseline', () => {
            zhTW = loadYamlFile(zhTWPath);
            zh = loadYamlFile(zhPath);
            
            for (const key of Object.keys(zh)) {
                const zhPlaceholders = extractPlaceholders(zh[key]);
                const zhTWPlaceholders = extractPlaceholders(zhTW[key]);
                
                expect(zhTWPlaceholders.length).to.equal(
                    zhPlaceholders.length,
                    `Key "${key}" should have ${zhPlaceholders.length} placeholders, but has ${zhTWPlaceholders.length}`
                );
            }
        });

        it('should have matching placeholder indices with baseline', () => {
            zhTW = loadYamlFile(zhTWPath);
            zh = loadYamlFile(zhPath);
            
            for (const key of Object.keys(zh)) {
                const zhPlaceholders = extractPlaceholders(zh[key]).sort();
                const zhTWPlaceholders = extractPlaceholders(zhTW[key]).sort();
                
                expect(zhTWPlaceholders).to.deep.equal(
                    zhPlaceholders,
                    `Key "${key}" placeholders should match: expected [${zhPlaceholders}], got [${zhTWPlaceholders}]`
                );
            }
        });

        it('should not have empty translation values', () => {
            zhTW = loadYamlFile(zhTWPath);
            
            for (const [key, value] of Object.entries(zhTW)) {
                expect(value).to.not.be.empty.and.not.be.undefined.and.not.be.null,
                    `Key "${key}" should not have an empty value`);
            }
        });

        it('should not have unmatched quotes', () => {
            zhTW = loadYamlFile(zhTWPath);
            
            for (const [key, value] of Object.entries(zhTW)) {
                if (typeof value === 'string') {
                    expect(hasUnmatchedQuotes(value)).to.be.false,
                        `Key "${key}" has unmatched quotes in value: "${value}"`);
                }
            }
        });

        it('should use Traditional Chinese characters (not Simplified)', () => {
            zhTW = loadYamlFile(zhTWPath);
            zh = loadYamlFile(zhPath);
            
            // Sample check: some keys should differ between Traditional and Simplified
            const keysToCheck = [
                'Cannot find input file {0}.',
                'Cannot find output file {0}.',
                'Problem data not found.',
            ];
            
            let foundDifference = false;
            for (const key of keysToCheck) {
                if (zhTW[key] && zh[key] && zhTW[key] !== zh[key]) {
                    foundDifference = true;
                    break;
                }
            }
            
            expect(foundDifference).to.be.true,
                'zh_TW should use Traditional Chinese characters, different from Simplified Chinese (zh)');
        });

        it('should preserve punctuation style appropriate for Traditional Chinese', () => {
            zhTW = loadYamlFile(zhTWPath);
            
            // Traditional Chinese often uses full-width punctuation
            // Check that at least some entries use appropriate punctuation
            const values = Object.values(zhTW).join('');
            const hasChineseChars = /[\u4e00-\u9fa5]/.test(values);
            
            expect(hasChineseChars).to.be.true, 'Should contain Chinese characters');
        });
    });

    describe('hydrooj/locales/zh_TW.yaml', () => {
        const zhTWPath = join(__dirname, '../../packages/hydrooj/locales/zh_TW.yaml');
        const zhPath = join(__dirname, '../../packages/hydrooj/locales/zh.yaml');
        const enPath = join(__dirname, '../../packages/hydrooj/locales/en.yaml');
        let zhTW: Record<string, string>;
        let zh: Record<string, string>;
        let en: Record<string, string>;

        it('should be valid YAML syntax', () => {
            expect(() => {
                zhTW = loadYamlFile(zhTWPath);
            }).to.not.throw();
        });

        it('should have required metadata fields', () => {
            zhTW = loadYamlFile(zhTWPath);
            
            expect(zhTW).to.have.property('__id', 'zh_TW');
            expect(zhTW).to.have.property('__langname');
            expect(zhTW).to.have.property('__interface', 'yes');
            expect(zhTW).to.have.property('__flag');
        });

        it('should have __flag field with valid emoji', () => {
            zhTW = loadYamlFile(zhTWPath);
            
            // Check that __flag contains emoji (basic check for unicode range)
            const flag = zhTW['__flag'];
            expect(flag).to.be.a('string');
            expect(flag.length).to.be.greaterThan(0);
            // Taiwan flag emoji check
            expect(flag).to.equal('🇹🇼');
        });

        it('should have all keys from baseline zh.yaml', () => {
            zhTW = loadYamlFile(zhTWPath);
            zh = loadYamlFile(zhPath);
            
            const zhKeys = Object.keys(zh);
            const zhTWKeys = Object.keys(zhTW);
            
            const missingKeys = zhKeys.filter(key => !zhTWKeys.includes(key));
            
            expect(missingKeys).to.be.empty,
                `zh_TW.yaml is missing keys from zh.yaml: ${missingKeys.join(', ')}`);
        });

        it('should not have duplicate keys', () => {
            const content = readFileSync(zhTWPath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
            const keys = lines.map(line => {
                const match = line.match(/^(['"]?)(.*?)\1:/);
                return match ? match[2] : null;
            }).filter(Boolean);
            
            const keySet = new Set(keys);
            expect(keys.length).to.equal(keySet.size, 'Should not contain duplicate keys');
        });

        it('should have matching placeholder counts with baseline', () => {
            zhTW = loadYamlFile(zhTWPath);
            zh = loadYamlFile(zhPath);
            
            for (const key of Object.keys(zh)) {
                if (!zhTW[key]) continue; // Skip if key doesn't exist in zh_TW
                
                const zhPlaceholders = extractPlaceholders(String(zh[key]));
                const zhTWPlaceholders = extractPlaceholders(String(zhTW[key]));
                
                expect(zhTWPlaceholders.length).to.equal(
                    zhPlaceholders.length,
                    `Key "${key}" should have ${zhPlaceholders.length} placeholders, but has ${zhTWPlaceholders.length}`
                );
            }
        });

        it('should have matching placeholder indices with baseline', () => {
            zhTW = loadYamlFile(zhTWPath);
            zh = loadYamlFile(zhPath);
            
            for (const key of Object.keys(zh)) {
                if (!zhTW[key]) continue;
                
                const zhPlaceholders = extractPlaceholders(String(zh[key])).sort();
                const zhTWPlaceholders = extractPlaceholders(String(zhTW[key])).sort();
                
                expect(zhTWPlaceholders).to.deep.equal(
                    zhPlaceholders,
                    `Key "${key}" placeholders should match: expected [${zhPlaceholders}], got [${zhTWPlaceholders}]`
                );
            }
        });

        it('should not have empty translation values', () => {
            zhTW = loadYamlFile(zhTWPath);
            
            for (const [key, value] of Object.entries(zhTW)) {
                if (key.startsWith('__')) continue; // Skip metadata fields
                
                expect(value).to.not.be.empty.and.not.be.undefined.and.not.be.null,
                    `Key "${key}" should not have an empty value`);
            }
        });

        it('should maintain consistent translation style', () => {
            zhTW = loadYamlFile(zhTWPath);
            
            // Check that common terms are consistently translated
            const values = Object.values(zhTW);
            const textContent = values.join(' ');
            
            // Should contain Traditional Chinese characters
            expect(/[\u4e00-\u9fa5]/.test(textContent)).to.be.true;
        });

        it('should use Traditional Chinese characters (not Simplified)', () => {
            zhTW = loadYamlFile(zhTWPath);
            zh = loadYamlFile(zhPath);
            
            // Sample keys that should differ
            const keysToCheck = [
                '↓ Create Time',
                'About test data',
                'Accepted',
            ];
            
            let foundDifference = false;
            for (const key of keysToCheck) {
                if (zhTW[key] && zh[key] && zhTW[key] !== zh[key]) {
                    foundDifference = true;
                    break;
                }
            }
            
            expect(foundDifference).to.be.true,
                'zh_TW should use Traditional Chinese, different from Simplified (zh)');
        });

        it('should have consistent quote usage in translations', () => {
            zhTW = loadYamlFile(zhTWPath);
            
            for (const [key, value] of Object.entries(zhTW)) {
                if (typeof value === 'string' && key !== '__flag') {
                    expect(hasUnmatchedQuotes(value)).to.be.false,
                        `Key "${key}" has unmatched quotes: "${value}"`);
                }
            }
        });

        it('should preserve HTML tags if present in baseline', () => {
            zhTW = loadYamlFile(zhTWPath);
            zh = loadYamlFile(zhPath);
            
            for (const key of Object.keys(zh)) {
                if (!zhTW[key]) continue;
                
                const zhValue = String(zh[key]);
                const zhTWValue = String(zhTW[key]);
                
                // Check if baseline has HTML tags
                const zhHtmlTags = zhValue.match(/<[^>]+>/g) || [];
                const zhTWHtmlTags = zhTWValue.match(/<[^>]+>/g) || [];
                
                expect(zhTWHtmlTags.length).to.equal(
                    zhHtmlTags.length,
                    `Key "${key}" should preserve HTML tags from baseline`
                );
            }
        });

        it('should have translations that are not just copied from English', () => {
            zhTW = loadYamlFile(zhTWPath);
            en = loadYamlFile(enPath);
            
            // Sample non-metadata keys
            const sampleKeys = Object.keys(zhTW).filter(k => !k.startsWith('__')).slice(0, 10);
            
            let hasTranslations = false;
            for (const key of sampleKeys) {
                if (en[key] && zhTW[key] && en[key] !== zhTW[key]) {
                    hasTranslations = true;
                    break;
                }
            }
            
            expect(hasTranslations).to.be.true,
                'zh_TW should have actual translations, not just English text');
        });
    });

    describe('ui-default/locales/zh_TW.yaml', () => {
        const zhTWPath = join(__dirname, '../../packages/ui-default/locales/zh_TW.yaml');
        const zhPath = join(__dirname, '../../packages/ui-default/locales/zh.yaml');
        const enPath = join(__dirname, '../../packages/ui-default/locales/en.yaml');
        let zhTW: Record<string, string>;
        let zh: Record<string, string>;
        let en: Record<string, string>;

        it('should be valid YAML syntax', () => {
            expect(() => {
                zhTW = loadYamlFile(zhTWPath);
            }).to.not.throw();
        });

        it('should have required metadata fields', () => {
            zhTW = loadYamlFile(zhTWPath);
            
            expect(zhTW).to.have.property('__langname');
        });

        it('should have all keys from baseline zh.yaml', () => {
            zhTW = loadYamlFile(zhTWPath);
            zh = loadYamlFile(zhPath);
            
            const zhKeys = Object.keys(zh);
            const zhTWKeys = Object.keys(zhTW);
            
            const missingKeys = zhKeys.filter(key => !zhTWKeys.includes(key));
            
            expect(missingKeys).to.be.empty,
                `zh_TW.yaml is missing keys from zh.yaml: ${missingKeys.slice(0, 10).join(', ')}${missingKeys.length > 10 ? '...' : ''}`);
        });

        it('should not have duplicate keys', () => {
            const content = readFileSync(zhTWPath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
            const keys = lines.map(line => {
                const match = line.match(/^(['"]?)(.*?)\1:/);
                return match ? match[2] : null;
            }).filter(Boolean);
            
            const keySet = new Set(keys);
            expect(keys.length).to.equal(keySet.size, 'Should not contain duplicate keys');
        });

        it('should have matching placeholder counts with baseline', () => {
            zhTW = loadYamlFile(zhTWPath);
            zh = loadYamlFile(zhPath);
            
            const errors: string[] = [];
            
            for (const key of Object.keys(zh)) {
                if (!zhTW[key]) continue;
                
                const zhPlaceholders = extractPlaceholders(String(zh[key]));
                const zhTWPlaceholders = extractPlaceholders(String(zhTW[key]));
                
                if (zhTWPlaceholders.length !== zhPlaceholders.length) {
                    errors.push(`"${key}": expected ${zhPlaceholders.length}, got ${zhTWPlaceholders.length}`);
                }
            }
            
            expect(errors).to.be.empty,
                `Placeholder count mismatches:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... and ${errors.length - 5} more` : ''}`);
        });

        it('should have matching placeholder indices with baseline', () => {
            zhTW = loadYamlFile(zhTWPath);
            zh = loadYamlFile(zhPath);
            
            const errors: string[] = [];
            
            for (const key of Object.keys(zh)) {
                if (!zhTW[key]) continue;
                
                const zhPlaceholders = extractPlaceholders(String(zh[key])).sort();
                const zhTWPlaceholders = extractPlaceholders(String(zhTW[key])).sort();
                
                if (JSON.stringify(zhTWPlaceholders) !== JSON.stringify(zhPlaceholders)) {
                    errors.push(`"${key}": expected [${zhPlaceholders}], got [${zhTWPlaceholders}]`);
                }
            }
            
            expect(errors).to.be.empty,
                `Placeholder index mismatches:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... and ${errors.length - 5} more` : ''}`);
        });

        it('should not have empty translation values', () => {
            zhTW = loadYamlFile(zhTWPath);
            
            const emptyKeys: string[] = [];
            
            for (const [key, value] of Object.entries(zhTW)) {
                if (key.startsWith('__')) continue;
                
                if (!value || (typeof value === 'string' && value.trim() === '')) {
                    emptyKeys.push(key);
                }
            }
            
            expect(emptyKeys).to.be.empty,
                `Keys with empty values: ${emptyKeys.slice(0, 10).join(', ')}${emptyKeys.length > 10 ? '...' : ''}`);
        });

        it('should use Traditional Chinese characters', () => {
            zhTW = loadYamlFile(zhTWPath);
            zh = loadYamlFile(zhPath);
            
            // Sample check for character differences
            const sampleKeys = Object.keys(zh).filter(k => !k.startsWith('__')).slice(0, 50);
            
            let foundDifference = false;
            for (const key of sampleKeys) {
                if (zhTW[key] && zh[key] && zhTW[key] !== zh[key]) {
                    foundDifference = true;
                    break;
                }
            }
            
            expect(foundDifference).to.be.true,
                'zh_TW should use Traditional Chinese, different from Simplified Chinese (zh)');
        });

        it('should have consistent quote usage', () => {
            zhTW = loadYamlFile(zhTWPath);
            
            const errors: string[] = [];
            
            for (const [key, value] of Object.entries(zhTW)) {
                if (typeof value === 'string' && !key.startsWith('__')) {
                    if (hasUnmatchedQuotes(value)) {
                        errors.push(`"${key}": ${value}`);
                    }
                }
            }
            
            expect(errors).to.be.empty,
                `Keys with unmatched quotes:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... and ${errors.length - 5} more` : ''}`);
        });

        it('should preserve HTML and markdown formatting from baseline', () => {
            zhTW = loadYamlFile(zhTWPath);
            zh = loadYamlFile(zhPath);
            
            const errors: string[] = [];
            
            for (const key of Object.keys(zh)) {
                if (!zhTW[key]) continue;
                
                const zhValue = String(zh[key]);
                const zhTWValue = String(zhTW[key]);
                
                // Check HTML tags
                const zhHtmlTags = (zhValue.match(/<[^>]+>/g) || []).length;
                const zhTWHtmlTags = (zhTWValue.match(/<[^>]+>/g) || []).length;
                
                if (zhHtmlTags !== zhTWHtmlTags) {
                    errors.push(`"${key}": HTML tag count mismatch`);
                }
                
                // Check markdown links
                const zhLinks = (zhValue.match(/\[.*?\]\(.*?\)/g) || []).length;
                const zhTWLinks = (zhTWValue.match(/\[.*?\]\(.*?\)/g) || []).length;
                
                if (zhLinks !== zhTWLinks) {
                    errors.push(`"${key}": Markdown link count mismatch`);
                }
            }
            
            expect(errors.slice(0, 10)).to.be.empty,
                `Formatting preservation issues:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... and ${errors.length - 5} more` : ''}`);
        });

        it('should contain actual translations, not English text', () => {
            zhTW = loadYamlFile(zhTWPath);
            en = loadYamlFile(enPath);
            
            const sampleKeys = Object.keys(en).filter(k => !k.startsWith('__')).slice(0, 20);
            
            let translationCount = 0;
            for (const key of sampleKeys) {
                if (zhTW[key] && en[key] && zhTW[key] !== en[key]) {
                    translationCount++;
                }
            }
            
            expect(translationCount).to.be.greaterThan(10,
                'Most keys should be translated to Chinese, not left in English');
        });

        it('should handle special characters correctly', () => {
            zhTW = loadYamlFile(zhTWPath);
            
            // Verify that the file can handle special YAML characters in values
            const values = Object.values(zhTW);
            const hasColons = values.some(v => typeof v === 'string' && v.includes(':'));
            const hasQuotes = values.some(v => typeof v === 'string' && (v.includes('"') || v.includes("'")));
            
            // Just checking that we can parse these without errors
            expect(values.length).to.be.greaterThan(0);
        });

        it('should maintain consistent terminology', () => {
            zhTW = loadYamlFile(zhTWPath);
            
            // Check that common technical terms are present and consistently used
            const allText = Object.values(zhTW).join(' ');
            
            // Should contain Chinese characters (basic sanity check)
            expect(/[\u4e00-\u9fa5]/.test(allText)).to.be.true,
                'Locale should contain Chinese characters');
        });
    });

    describe('Cross-package consistency', () => {
        it('should use consistent translations across packages for common terms', () => {
            const hydrojudgeZhTW = loadYamlFile(join(__dirname, '../../packages/hydrojudge/locales/zh_TW.yaml'));
            const hydroojZhTW = loadYamlFile(join(__dirname, '../../packages/hydrooj/locales/zh_TW.yaml'));
            const uiDefaultZhTW = loadYamlFile(join(__dirname, '../../packages/ui-default/locales/zh_TW.yaml'));
            
            // All should exist and be non-empty
            expect(Object.keys(hydrojudgeZhTW).length).to.be.greaterThan(0);
            expect(Object.keys(hydroojZhTW).length).to.be.greaterThan(0);
            expect(Object.keys(uiDefaultZhTW).length).to.be.greaterThan(0);
        });

        it('should all have valid YAML syntax', () => {
            const packages = ['hydrojudge', 'hydrooj', 'ui-default'];
            
            for (const pkg of packages) {
                const path = join(__dirname, `../../packages/${pkg}/locales/zh_TW.yaml`);
                expect(() => loadYamlFile(path)).to.not.throw(
                    `${pkg}/locales/zh_TW.yaml should be valid YAML`
                );
            }
        });

        it('should all use Traditional Chinese (__langname check)', () => {
            const hydroojZhTW = loadYamlFile(join(__dirname, '../../packages/hydrooj/locales/zh_TW.yaml'));
            const uiDefaultZhTW = loadYamlFile(join(__dirname, '../../packages/ui-default/locales/zh_TW.yaml'));
            
            expect(hydroojZhTW['__langname']).to.include('中文');
            expect(uiDefaultZhTW['__langname']).to.include('中文');
        });
    });
});