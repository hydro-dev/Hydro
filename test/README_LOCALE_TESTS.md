# Locale File Validation Tests

## Overview

This test suite provides comprehensive validation for YAML locale files across the Hydro project packages. It was created to validate the Traditional Chinese (zh_TW) locale files added/modified in this branch.

## Test Coverage

### Files Tested
- `packages/hydrojudge/locales/zh_TW.yaml` (39 lines)
- `packages/hydrooj/locales/zh_TW.yaml` (955 lines)
- `packages/ui-default/locales/zh_TW.yaml` (1132 lines)

### Validation Checks

1. **UTF-8 Encoding**: Ensures files are properly encoded and readable
2. **Chinese Character Presence**: Validates that zh_TW files contain Traditional Chinese characters
3. **YAML Structure**: Checks for valid YAML key: value format
4. **Duplicate Keys**: Detects duplicate translation keys
5. **Parameter Placeholders**: Validates {0}, {1}, etc. are sequential and start from 0
6. **Locale Metadata**: Verifies __id and other metadata are correct
7. **Non-Empty Translations**: Ensures files have actual translation content
8. **Syntax Errors**: Checks for common YAML syntax issues (tabs, unclosed quotes, etc.)

### Cross-Package Validation

- **Consistency**: Ensures zh_TW locale exists across all packages
- **Naming Convention**: Validates locale file naming follows standard format (xx or xx_YY)

## Running the Tests

```bash
# Run locale validation tests
node --test test/locale.spec.js

# Run all tests including locale validation
npm test
```

## Test Results

The tests validate:
- ✓ 23 passing tests
- ⚠ 3 tests with failures that need attention:
  - Duplicate key issues in hydrooj and ui-default zh_TW files
  - YAML structure issue in hydrojudge zh_TW file

## Issues Found

### Duplicate Keys
Some locale files have duplicate keys like `'{0}` which may cause translation conflicts.

### Parameter Placeholders
Some keys use non-sequential placeholders (e.g., `{1}` without `{0}`), which may indicate missing parameters.

### Syntax Warnings
Some lines have potentially unclosed quotes, though these may be intentional in certain contexts.

## Test Maintenance

These tests should be run:
- Before merging any locale file changes
- When adding new locale files
- As part of CI/CD pipeline

## Adding New Locale Tests

To add validation for a new locale:

1. Add the file path to the `changedLocaleFiles` array in `test/locale.spec.js`
2. Add any locale-specific validation rules if needed
3. Run the tests to ensure they pass

## Technical Details

- Uses Node.js built-in `node:test` and `node:assert` modules
- No external dependencies required (except js-yaml which is already in the project)
- Simple YAML parser for basic validation when full YAML library unavailable
- Cross-platform compatible

## Future Improvements

- [ ] Add validation for parameter placeholder consistency across locales
- [ ] Check for missing translations compared to reference locale (en)
- [ ] Validate special characters and escape sequences
- [ ] Add automated translation quality checks
- [ ] Integrate with CI/CD for automatic validation on PR