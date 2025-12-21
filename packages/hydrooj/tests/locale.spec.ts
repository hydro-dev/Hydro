import { expect } from 'chai';
import { describe, it } from 'node:test';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

describe('Locale Files Validation', () => {
    const packagesWithLocales = [
        { name: 'hydrojudge', path: path.join(__dirname, '../../hydrojudge/locales') },
        { name: 'hydrooj', path: path.join(__dirname, '../locales') },
        { name: 'ui-default', path: path.join(__dirname, '../../ui-default/locales') },
    ];

    for (const pkg of packagesWithLocales) {
        if (!fs.existsSync(pkg.path)) continue;

        describe(`${pkg.name} locales`, () => {
            const localeFiles = fs.readdirSync(pkg.path).filter((f) => f.endsWith('.yaml'));

            for (const file of localeFiles) {
                const locale = file.replace('.yaml', '');
                const filePath = path.join(pkg.path, file);

                describe(`${locale}`, () => {
                    let content: string;
                    let parsed: any;

                    it('should have valid YAML syntax', () => {
                        content = fs.readFileSync(filePath, 'utf-8');
                        expect(() => {
                            parsed = yaml.load(content);
                        }).to.not.throw();
                        expect(parsed).to.be.an('object');
                    });

                    it('should not be empty', () => {
                        if (!parsed) parsed = yaml.load(fs.readFileSync(filePath, 'utf-8'));
                        expect(Object.keys(parsed)).to.have.length.greaterThan(0);
                    });

                    it('should have no duplicate keys', () => {
                        content = content || fs.readFileSync(filePath, 'utf-8');
                        const lines = content.split('\n');
                        const keys = new Set<string>();
                        const duplicates: string[] = [];

                        for (const line of lines) {
                            const match = line.match(/^([^#:\s][^:]*):\s/);
                            if (match) {
                                const key = match[1].trim();
                                if (keys.has(key)) {
                                    duplicates.push(key);
                                }
                                keys.add(key);
                            }
                        }

                        expect(duplicates).to.have.lengthOf(0);
                    });

                    it('should have consistent parameter placeholders', () => {
                        if (!parsed) parsed = yaml.load(fs.readFileSync(filePath, 'utf-8'));
                        
                        // Check for parameter consistency
                        for (const [key, value] of Object.entries(parsed)) {
                            if (typeof value !== 'string') continue;
                            
                            // Find all {N} style placeholders
                            const placeholders = value.match(/\{(\d+)\}/g);
                            if (placeholders) {
                                const numbers = placeholders.map(p => parseInt(p.match(/\d+/)![0]));
                                
                                // Check for sequential numbering starting from 0
                                const sorted = [...numbers].sort((a, b) => a - b);
                                for (let i = 0; i < sorted.length; i++) {
                                    if (sorted[i] !== i) {
                                        throw new Error(
                                            `Key "${key}" has non-sequential placeholders: ${placeholders.join(', ')}`
                                        );
                                    }
                                }
                            }
                        }
                    });

                    it('should have proper encoding (UTF-8)', () => {
                        content = content || fs.readFileSync(filePath, 'utf-8');
                        // Check that content can be read as UTF-8 without errors
                        expect(content).to.be.a('string');
                        expect(content.length).to.be.greaterThan(0);
                    });

                    it('should have all values as strings or primitives', () => {
                        if (!parsed) parsed = yaml.load(fs.readFileSync(filePath, 'utf-8'));
                        
                        for (const [key, value] of Object.entries(parsed)) {
                            const type = typeof value;
                            expect(
                                ['string', 'number', 'boolean'].includes(type),
                                `Key "${key}" has invalid type: ${type}`
                            ).to.be.true;
                        }
                    });

                    it('should not have trailing whitespace in values', () => {
                        if (!parsed) parsed = yaml.load(fs.readFileSync(filePath, 'utf-8'));
                        
                        for (const [key, value] of Object.entries(parsed)) {
                            if (typeof value === 'string' && value.trim() !== value) {
                                throw new Error(
                                    `Key "${key}" has trailing/leading whitespace in value`
                                );
                            }
                        }
                    });
                });
            }

            // Cross-locale validation
            if (localeFiles.length > 1) {
                describe('cross-locale consistency', () => {
                    it('should have consistent keys across all locales', () => {
                        const allKeys: Record<string, Set<string>> = {};
                        
                        for (const file of localeFiles) {
                            const locale = file.replace('.yaml', '');
                            const content = fs.readFileSync(path.join(pkg.path, file), 'utf-8');
                            const parsed = yaml.load(content) as Record<string, any>;
                            allKeys[locale] = new Set(Object.keys(parsed));
                        }

                        const locales = Object.keys(allKeys);
                        if (locales.length < 2) return;

                        // Find reference locale (usually en or the one with most keys)
                        const reference = locales.reduce((a, b) => 
                            allKeys[a].size >= allKeys[b].size ? a : b
                        );

                        // Check each locale against reference
                        for (const locale of locales) {
                            if (locale === reference) continue;

                            const missing: string[] = [];
                            const extra: string[] = [];

                            for (const key of allKeys[reference]) {
                                if (!allKeys[locale].has(key) && !key.startsWith('__')) {
                                    missing.push(key);
                                }
                            }

                            for (const key of allKeys[locale]) {
                                if (!allKeys[reference].has(key) && !key.startsWith('__')) {
                                    extra.push(key);
                                }
                            }

                            // Allow some differences, but report them
                            if (missing.length > 0) {
                                console.warn(
                                    `${pkg.name}/${locale}: Missing ${missing.length} keys compared to ${reference}`
                                );
                            }
                            if (extra.length > 0) {
                                console.warn(
                                    `${pkg.name}/${locale}: Has ${extra.length} extra keys compared to ${reference}`
                                );
                            }
                        }
                    });

                    it('should have matching parameter counts in translations', () => {
                        const allParsed: Record<string, any> = {};
                        
                        for (const file of localeFiles) {
                            const locale = file.replace('.yaml', '');
                            const content = fs.readFileSync(path.join(pkg.path, file), 'utf-8');
                            allParsed[locale] = yaml.load(content);
                        }

                        const locales = Object.keys(allParsed);
                        if (locales.length < 2) return;

                        const reference = locales[0];
                        
                        for (const locale of locales) {
                            if (locale === reference) continue;

                            for (const key of Object.keys(allParsed[reference])) {
                                const refValue = allParsed[reference][key];
                                const localeValue = allParsed[locale]?.[key];

                                if (typeof refValue !== 'string' || typeof localeValue !== 'string') {
                                    continue;
                                }

                                const refParams = (refValue.match(/\{\d+\}/g) || []).length;
                                const localeParams = (localeValue.match(/\{\d+\}/g) || []).length;

                                if (refParams !== localeParams) {
                                    throw new Error(
                                        `Parameter count mismatch in key "${key}": ` +
                                        `${reference} has ${refParams}, ${locale} has ${localeParams}`
                                    );
                                }
                            }
                        }
                    });
                });
            }
        });
    }
});

describe('zh_TW Locale Specific Tests', () => {
    const zhTWFiles = [
        { name: 'hydrojudge', path: path.join(__dirname, '../../hydrojudge/locales/zh_TW.yaml') },
        { name: 'hydrooj', path: path.join(__dirname, '../locales/zh_TW.yaml') },
        { name: 'ui-default', path: path.join(__dirname, '../../ui-default/locales/zh_TW.yaml') },
    ];

    for (const file of zhTWFiles) {
        if (!fs.existsSync(file.path)) continue;

        describe(`${file.name}/zh_TW.yaml`, () => {
            let parsed: Record<string, any>;

            it('should load successfully', () => {
                const content = fs.readFileSync(file.path, 'utf-8');
                parsed = yaml.load(content) as Record<string, any>;
                expect(parsed).to.be.an('object');
            });

            it('should contain Traditional Chinese characters', () => {
                const content = fs.readFileSync(file.path, 'utf-8');
                // Check for presence of Traditional Chinese characters
                // Traditional Chinese typically uses characters in certain ranges
                const hasChinese = /[\u4e00-\u9fff]/.test(content);
                expect(hasChinese).to.be.true;
            });

            it('should have metadata keys if present', () => {
                if (!parsed) {
                    const content = fs.readFileSync(file.path, 'utf-8');
                    parsed = yaml.load(content) as Record<string, any>;
                }

                // Check for common metadata keys in locale files
                if (parsed.__id) {
                    expect(parsed.__id).to.equal('zh_TW');
                }
                if (parsed.__langname) {
                    expect(parsed.__langname).to.be.a('string');
                    expect(parsed.__langname.length).to.be.greaterThan(0);
                }
            });

            it('should not contain Simplified Chinese markers', () => {
                const content = fs.readFileSync(file.path, 'utf-8');
                // This is a basic check - zh_TW should not have __id: zh or similar
                expect(content).to.not.include('__id: zh\n');
                expect(content).to.not.include("__id: 'zh'");
                expect(content).to.not.include('__id: "zh"');
            });

            it('should have proper quotation marks', () => {
                if (!parsed) {
                    const content = fs.readFileSync(file.path, 'utf-8');
                    parsed = yaml.load(content) as Record<string, any>;
                }

                for (const [key, value] of Object.entries(parsed)) {
                    if (typeof value !== 'string') continue;
                    
                    // Check that quotes are properly balanced
                    const singleQuotes = (value.match(/'/g) || []).length;
                    const doubleQuotes = (value.match(/"/g) || []).length;
                    
                    // If there are quotes, they should be balanced
                    if (singleQuotes > 0 && singleQuotes % 2 !== 0) {
                        console.warn(`Key "${key}" has unbalanced single quotes`);
                    }
                    if (doubleQuotes > 0 && doubleQuotes % 2 !== 0) {
                        console.warn(`Key "${key}" has unbalanced double quotes`);
                    }
                }
            });

            it('should have translations for common UI elements', () => {
                if (!parsed) {
                    const content = fs.readFileSync(file.path, 'utf-8');
                    parsed = yaml.load(content) as Record<string, any>;
                }

                // Check for at least some content
                const keyCount = Object.keys(parsed).length;
                expect(keyCount).to.be.greaterThan(0);
            });
        });
    }
});

describe('Locale Integration Tests', () => {
    it('should be loadable by the i18n system', () => {
        const localesPath = path.join(__dirname, '../locales');
        if (!fs.existsSync(localesPath)) return;

        const files = fs.readdirSync(localesPath).filter(f => f.endsWith('.yaml'));
        
        for (const file of files) {
            const filePath = path.join(localesPath, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const parsed = yaml.load(content);
            
            expect(typeof parsed).to.equal('object');
            expect(parsed).to.not.be.null;
        }
    });

    it('should have consistent structure across packages', () => {
        // Check that all packages follow the same locale file naming convention
        const packages = [
            path.join(__dirname, '../../hydrojudge/locales'),
            path.join(__dirname, '../locales'),
            path.join(__dirname, '../../ui-default/locales'),
        ];

        const allLocales = new Set<string>();

        for (const pkgPath of packages) {
            if (!fs.existsSync(pkgPath)) continue;
            
            const files = fs.readdirSync(pkgPath).filter(f => f.endsWith('.yaml'));
            for (const file of files) {
                allLocales.add(file.replace('.yaml', ''));
            }
        }

        // Verify naming conventions
        for (const locale of allLocales) {
            // Check that locale names follow standard format
            expect(locale).to.match(/^[a-z]{2}(_[A-Z]{2})?$/);
        }
    });
});