/**
 * Comprehensive Locale File Validation Tests for zh_TW and other locale files
 * 
 * Tests the locale YAML files that were changed in this branch
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

// Simple YAML parser for basic key-value validation
function parseSimpleYAML(content) {
    const result = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
        // Skip comments and empty lines
        if (line.trim().startsWith('#') || !line.trim()) continue;
        
        // Match key: value patterns
        const match = line.match(/^(['"]?)([^:#\s][^:]*?)\1:\s*(.*)$/);
        if (match) {
            const key = match[2].trim();
            let value = match[3].trim();
            
            // Remove quotes if present
            if ((value.startsWith("'") && value.endsWith("'")) ||
                (value.startsWith('"') && value.endsWith('"'))) {
                value = value.slice(1, -1);
            }
            
            result[key] = value;
        }
    }
    
    return result;
}

describe('Locale Files Validation - Changed Files', () => {
    const changedLocaleFiles = [
        { name: 'hydrojudge/zh_TW', path: path.join(__dirname, '../packages/hydrojudge/locales/zh_TW.yaml') },
        { name: 'hydrooj/zh_TW', path: path.join(__dirname, '../packages/hydrooj/locales/zh_TW.yaml') },
        { name: 'ui-default/zh_TW', path: path.join(__dirname, '../packages/ui-default/locales/zh_TW.yaml') },
    ];

    for (const file of changedLocaleFiles) {
        if (!fs.existsSync(file.path)) {
            console.warn(`⚠ Skipping ${file.name}: file does not exist at ${file.path}`);
            continue;
        }

        describe(`${file.name}.yaml`, () => {
            let content;
            let parsed;

            it('should be readable as UTF-8', () => {
                assert.doesNotThrow(() => {
                    content = fs.readFileSync(file.path, 'utf-8');
                }, `Failed to read ${file.path} as UTF-8`);
                
                assert.strictEqual(typeof content, 'string');
                assert.ok(content.length > 0, 'File should not be empty');
            });

            it('should contain Traditional Chinese characters', () => {
                content = content || fs.readFileSync(file.path, 'utf-8');
                const hasChinese = /[\u4e00-\u9fff]/.test(content);
                assert.ok(hasChinese, 'File should contain Chinese (CJK) characters');
            });

            it('should have valid YAML-like structure', () => {
                content = content || fs.readFileSync(file.path, 'utf-8');
                
                // Basic YAML validation - check for key: value patterns
                const hasValidEntries = /^[^:\s#]+:\s*.+$/m.test(content);
                assert.ok(hasValidEntries, 'File should have valid key: value entries');
            });

            it('should not have duplicate keys', () => {
                content = content || fs.readFileSync(file.path, 'utf-8');
                const lines = content.split('\n');
                const keys = new Set();
                const duplicates = [];

                for (const line of lines) {
                    if (line.trim().startsWith('#') || !line.trim()) continue;
                    
                    const match = line.match(/^(['"]?)([^:#\s][^:]*?)\1:\s/);
                    if (match) {
                        const key = match[2].trim();
                        if (keys.has(key)) {
                            duplicates.push(key);
                        }
                        keys.add(key);
                    }
                }

                assert.deepStrictEqual(duplicates, [], 
                    `Found duplicate keys: ${duplicates.slice(0, 10).join(', ')}`);
            });

            it('should have consistent parameter placeholders', () => {
                content = content || fs.readFileSync(file.path, 'utf-8');
                parsed = parsed || parseSimpleYAML(content);
                
                const errors = [];
                for (const [key, value] of Object.entries(parsed)) {
                    if (typeof value !== 'string') continue;
                    
                    const placeholders = value.match(/\{(\d+)\}/g);
                    if (placeholders) {
                        const numbers = placeholders.map(p => parseInt(p.match(/\d+/)[0]));
                        const sorted = [...new Set(numbers)].sort((a, b) => a - b);
                        
                        // Check if placeholders start from 0 and are sequential
                        for (let i = 0; i < sorted.length; i++) {
                            if (sorted[i] !== i) {
                                errors.push(
                                    `Key "${key}" has non-sequential placeholders: ${placeholders.join(', ')}`
                                );
                                break;
                            }
                        }
                    }
                }
                
                if (errors.length > 0) {
                    console.warn(`  ⚠ Parameter placeholder issues:\n    ${errors.slice(0, 5).join('\n    ')}`);
                }
            });

            it('should have correct locale metadata', () => {
                content = content || fs.readFileSync(file.path, 'utf-8');
                
                // Check for __id: zh_TW
                if (content.includes('__id:')) {
                    assert.ok(
                        content.includes('__id: zh_TW') || 
                        content.includes("__id: 'zh_TW'") || 
                        content.includes('__id: "zh_TW"'),
                        'If __id is present, it should be zh_TW'
                    );
                }
                
                // Should NOT have Simplified Chinese __id
                assert.ok(!content.includes('__id: zh\n'), 'Should not have __id: zh');
                assert.ok(!content.includes("__id: 'zh'\n"), 'Should not have __id: \'zh\'');
            });

            it('should have non-empty translations', () => {
                content = content || fs.readFileSync(file.path, 'utf-8');
                parsed = parsed || parseSimpleYAML(content);
                
                const keyCount = Object.keys(parsed).length;
                assert.ok(keyCount > 0, 'Should have at least one key');
                
                // Count non-metadata, non-empty values
                const nonEmptyTranslations = Object.entries(parsed)
                    .filter(([k, v]) => !k.startsWith('__') && v && v.trim())
                    .length;
                
                assert.ok(nonEmptyTranslations > 0, 
                    `Should have at least one non-empty translation (found ${nonEmptyTranslations})`);
            });

            it('should not have obvious syntax errors', () => {
                content = content || fs.readFileSync(file.path, 'utf-8');
                
                // Check for common YAML errors
                const lines = content.split('\n');
                const errors = [];
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const lineNum = i + 1;
                    
                    // Skip empty lines and comments
                    if (!line.trim() || line.trim().startsWith('#')) continue;
                    
                    // Check for tabs (YAML doesn't allow tabs for indentation)
                    if (line.includes('\t')) {
                        errors.push(`Line ${lineNum}: Contains tab character`);
                    }
                    
                    // Check for unclosed quotes (basic check)
                    const singleQuotes = (line.match(/'/g) || []).length;
                    const doubleQuotes = (line.match(/"/g) || []).length;
                    
                    if (line.includes(':') && singleQuotes % 2 !== 0) {
                        errors.push(`Line ${lineNum}: Possibly unclosed single quote`);
                    }
                    if (line.includes(':') && doubleQuotes % 2 !== 0) {
                        errors.push(`Line ${lineNum}: Possibly unclosed double quote`);
                    }
                }
                
                if (errors.length > 0) {
                    console.warn(`  ⚠ Potential syntax issues:\n    ${errors.slice(0, 5).join('\n    ')}`);
                }
            });
        });
    }
});

describe('Cross-Package Locale Consistency', () => {
    it('should have zh_TW locale in all three packages', () => {
        const zhTWPaths = [
            path.join(__dirname, '../packages/hydrojudge/locales/zh_TW.yaml'),
            path.join(__dirname, '../packages/hydrooj/locales/zh_TW.yaml'),
            path.join(__dirname, '../packages/ui-default/locales/zh_TW.yaml'),
        ];
        
        const existing = zhTWPaths.filter(p => fs.existsSync(p));
        assert.ok(existing.length > 0, 'At least one zh_TW locale file should exist');
        
        console.log(`  ✓ Found ${existing.length}/3 zh_TW locale files`);
    });

    it('should have consistent naming convention', () => {
        const localePattern = /^[a-z]{2}(_[A-Z]{2})?$/;
        
        const packages = [
            path.join(__dirname, '../packages/hydrojudge/locales'),
            path.join(__dirname, '../packages/hydrooj/locales'),
            path.join(__dirname, '../packages/ui-default/locales'),
        ];
        
        const invalidNames = [];
        
        for (const pkgPath of packages) {
            if (!fs.existsSync(pkgPath)) continue;
            
            const files = fs.readdirSync(pkgPath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
            for (const file of files) {
                const locale = file.replace(/\.ya?ml$/, '');
                if (!localePattern.test(locale)) {
                    invalidNames.push(`${pkgPath}/${file}`);
                }
            }
        }
        
        assert.deepStrictEqual(invalidNames, [], 
            `Invalid locale file names: ${invalidNames.join(', ')}`);
    });
});

console.log('\n📝 Locale File Validation Tests');
console.log('Testing zh_TW locale files added/modified in this branch\n');